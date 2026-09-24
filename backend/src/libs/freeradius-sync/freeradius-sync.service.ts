import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { and, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { AAA_DB_TOKEN, type AaaDbClient } from '@db-aaa/db-aaa.module';
import { radacct } from '@db-aaa/schema';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { devices, radiusSessions } from '@db/schema';

const POLL_INTERVAL_MS = 15_000;
/**
 * Quet lui them mot khoang so voi lan dong bo truoc. FreeRADIUS UPDATE tai cho tren dong radacct
 * (interim, stop) nen khong the chi lay dong moi theo radacctid; ma dong ho hai may co the lech.
 * 5 phut du bu ca hai, va vi upsert nen quet trung khong gay hai gi ngoai vai dong thua.
 */
const OVERLAP_MS = 5 * 60_000;

/**
 * Dong bo phien tu `radacct` (FreeRADIUS so huu) ve `radius_sessions` (control DB).
 *
 * Ly do ton tai: khi RADIUS_MODE=freeradius, backend KHONG con nhan goi RADIUS nao — FreeRADIUS la
 * ben xac thuc va ghi accounting. Nhung toan bo giao dien (CREW, phien, quota, doi soat) doc tu
 * `radius_sessions`, nen phai co mot duong dua du lieu tu ben nay sang ben kia. Job nay la duong do.
 *
 * Quy uoc chieu byte giu DUNG nhu radius-parser.ts cua luong nhung, de hai che do khong cho ra so
 * nguoc nhau: Acct-Input = user UPLOAD (NAS nhan tu user), Acct-Output = user DOWNLOAD.
 *
 * Gigawords: KHONG cong them o day. Schema PostgreSQL cua FreeRADIUS da gop (gigawords << 32) vao
 * acctinput/outputoctets ngay trong queries.conf luc INSERT -- khac schema MySQL (luu 2 cot rieng).
 * Cong lan nua la nhan doi sai so tren moi phien vuot 4 GiB. Xem chu thich o db-aaa/schema.ts.
 *
 * Nhan dien NAS: `radacct.nasipaddress` doi chieu `devices.ip_address` — cung quy uoc voi
 * radius-server.service.ts. Dong nao khong khop thiet bi nao thi BO QUA va dem lai de canh bao,
 * thay vi doan bua mot ship_id (cot do NOT NULL, doan sai la ban so lieu vao nham tau).
 */
@Injectable()
export class FreeradiusSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FreeradiusSyncService.name);
  private timer?: NodeJS.Timeout;
  private lastSyncedAt = new Date(0);
  private running = false;

  /** Cho /health va radius-health doc — trang thai that, khong suy dien. */
  public lastRunAt: Date | null = null;
  public lastRunError: string | null = null;
  public lastRunSynced = 0;
  public lastRunSkippedUnknownNas = 0;

  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    @Optional() @Inject(AAA_DB_TOKEN) private readonly aaa: AaaDbClient | null,
  ) {}

  onModuleInit() {
    if (process.env.RADIUS_MODE !== 'freeradius') return;
    if (!this.aaa) {
      this.logger.error('RADIUS_MODE=freeradius nhung DATABASE_AAA_URL chưa cấu hình — không đồng bộ được phiên nào từ FreeRADIUS.');
      return;
    }
    this.logger.log(`Đồng bộ radacct → radius_sessions mỗi ${POLL_INTERVAL_MS / 1000}s.`);
    this.timer = setInterval(() => void this.syncOnce(), POLL_INTERVAL_MS);
    // unref: job nay khong duoc giu tien trinh song khi moi thu khac da dong.
    this.timer.unref?.();
    void this.syncOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async syncOnce(): Promise<void> {
    if (!this.aaa || this.running) return;
    this.running = true;
    const startedAt = new Date();
    try {
      const since = new Date(this.lastSyncedAt.getTime() - OVERLAP_MS);
      const rows = await this.aaa
        .select()
        .from(radacct)
        .where(
          or(
            // Phien con mo: luon quet lai, du lan cap nhat gan nhat da lau.
            isNull(radacct.acctStopTime),
            gt(radacct.acctUpdateTime, since),
            gt(radacct.acctStopTime, since),
            gt(radacct.acctStartTime, since),
          ),
        )
        .limit(5000);

      let synced = 0;
      let skipped = 0;
      for (const row of rows) {
        if (!row.acctStartTime || !row.username) continue;
        const device = await this.findDeviceByNasIp(row.nasIpAddress);
        if (!device?.shipId) {
          skipped += 1;
          continue;
        }

        const uploadBytes = row.acctInputOctets ?? null;
        const downloadBytes = row.acctOutputOctets ?? null;
        const isOpen = row.acctStopTime === null;

        await this.db
          .insert(radiusSessions)
          .values({
            shipId: device.shipId,
            deviceId: device.id,
            username: row.username,
            acctSessionId: row.acctSessionId,
            framedIp: row.framedIpAddress ?? null,
            callingStationMac: row.callingStationId ?? null,
            startTime: row.acctStartTime,
            stopTime: row.acctStopTime ?? null,
            lastInterimAt: row.acctUpdateTime ?? null,
            uploadBytes,
            downloadBytes,
            sessionTimeS: row.acctSessionTime ?? null,
            terminateCause: row.acctTerminateCause ?? null,
            status: isOpen ? 'ACTIVE' : 'CLOSED',
          })
          .onConflictDoUpdate({
            target: [radiusSessions.shipId, radiusSessions.acctSessionId],
            set: {
              stopTime: row.acctStopTime ?? null,
              lastInterimAt: row.acctUpdateTime ?? null,
              uploadBytes,
              downloadBytes,
              sessionTimeS: row.acctSessionTime ?? null,
              terminateCause: row.acctTerminateCause ?? null,
              status: isOpen ? 'ACTIVE' : 'CLOSED',
              framedIp: row.framedIpAddress ?? null,
              updatedAt: new Date(),
            },
          });
        synced += 1;
      }

      this.lastSyncedAt = startedAt;
      this.lastRunAt = startedAt;
      this.lastRunError = null;
      this.lastRunSynced = synced;
      this.lastRunSkippedUnknownNas = skipped;
      if (skipped > 0) {
        this.logger.warn(`${skipped} dòng radacct bị bỏ qua — nasipaddress không khớp devices.ip_address nào (hoặc thiết bị chưa gán tàu).`);
      }
      if (synced > 0) this.logger.log(`Đồng bộ ${synced} phiên từ FreeRADIUS.`);
    } catch (err) {
      this.lastRunAt = startedAt;
      this.lastRunError = (err as Error).message;
      this.logger.error(`Đồng bộ radacct thất bại: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async findDeviceByNasIp(nasIp: string) {
    if (!nasIp) return null;
    // nasipaddress la INET: pg co the tra ve "172.29.1.20" hoac "172.29.1.20/32" tuy driver/cast.
    const plain = nasIp.split('/')[0];
    const row = await this.db.query.devices.findFirst({
      where: and(eq(devices.ipAddress, plain), isNull(devices.deletedAt), isNotNull(devices.shipId)),
      columns: { id: true, shipId: true },
    });
    return row ?? null;
  }

  /** Dung cho endpoint health: do tuoi cua ban ghi accounting moi nhat ben FreeRADIUS. */
  async latestAccountingAt(): Promise<Date | null> {
    if (!this.aaa) return null;
    const [row] = await this.aaa
      .select({ latest: sql<Date | null>`max(greatest(${radacct.acctStartTime}, ${radacct.acctUpdateTime}, ${radacct.acctStopTime}))` })
      .from(radacct);
    return row?.latest ? new Date(row.latest) : null;
  }
}
