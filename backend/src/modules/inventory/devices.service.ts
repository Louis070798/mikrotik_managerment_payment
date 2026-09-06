import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, isNull, lte, sql, SQL } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { devices, interfaceCounterDeltas, interfaceCounterSamples, interfaces, rawTelemetryEvents, ships } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { AuditService } from '@audit/audit.service';
import { diffOf } from '@common/diff';
import { toDate } from '@common/sql-date';
import { bucketSql } from '@telemetry-normalize/aggregation';
import { CollectorTarget } from '@collectors/collector.types';
import { interfaceCounterReadingToEvent } from '@collectors/interface-counter.collector';
import { buildRadiusSecretVarName, EnvSecretStore } from '@secrets/env-secret-store';
import { InventoryCacheService } from '@inventory-cache/inventory-cache.service';
import { DASHBOARD_UNITS, makeDashboardMeta, resolvePeriod } from '../dashboard/dashboard.contract';
import { computeGap } from '../dashboard/dashboard.service';
import type { DashboardQuery } from '../dashboard/dto';
import { TelemetryService } from '../telemetry/telemetry.service';
import { CreateDeviceInput, DeviceTelemetryPushInput, UpdateDeviceInput } from './dto';

/** sha256 hex — dùng để so khớp X-Device-Api-Key với devices.api_key_hash, không bao giờ lưu key thật. */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface ListDevicesFilter {
  shipId?: string;
  role?: string;
  status?: string;
}

function toApi(row: typeof devices.$inferSelect) {
  return {
    id: row.id,
    ship_id: row.shipId,
    code: row.code,
    name: row.name,
    role: row.role,
    model: row.model,
    serial: row.serial,
    architecture: row.architecture,
    routeros_version: row.routerosVersion,
    device_mode: row.deviceMode,
    api_transport: row.apiTransport,
    // credential_ref là tham chiếu, không phải secret — an toàn để trả về (ADR-05).
    credential_ref: row.credentialRef,
    mgmt_endpoint_ref: row.mgmtEndpointRef,
    status: row.status,
    last_seen_at: row.lastSeenAt?.toISOString() ?? null,
    poll_interval_s: row.pollIntervalS,
    // Inventory thật (không phải secret) — IP quản trị router, dùng để dựng script push mẫu ở FE.
    ip_address: row.ipAddress,
    // Không bao giờ trả api_key_hash — chỉ báo đã cấu hình key hay chưa (giống secret_configured, ADR-05).
    push_key_configured: row.apiKeyHash !== null,
    push_key_issued_at: row.apiKeyIssuedAt?.toISOString() ?? null,
    // RADIUS secret thật đi qua EnvSecretStore, không nằm trong bảng devices — chỉ báo đã cấp
    // credential_ref (là con trỏ, ADR-05) hay chưa + mốc thời gian cấp gần nhất.
    radius_secret_configured: row.credentialRef !== null,
    radius_secret_issued_at: row.radiusSecretIssuedAt?.toISOString() ?? null,
    // Nguyên văn RouterOS config để tham khảo (vd /export) — chỉ lưu/hiển thị, server không bao giờ
    // tự thực thi hay đẩy xuống router.
    router_config_text: row.routerConfigText,
    router_config_updated_at: row.routerConfigUpdatedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class DevicesService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly audit: AuditService,
    private readonly telemetry: TelemetryService,
    private readonly secrets: EnvSecretStore,
    private readonly inventoryCache: InventoryCacheService,
  ) {}

  async list(filter: ListDevicesFilter) {
    const conditions: SQL[] = [isNull(devices.deletedAt)];
    if (filter.shipId) conditions.push(eq(devices.shipId, filter.shipId));
    if (filter.role) conditions.push(eq(devices.role, filter.role as any));
    if (filter.status) conditions.push(eq(devices.status, filter.status as any));

    const rows = await this.db
      .select()
      .from(devices)
      .where(and(...conditions))
      .orderBy(devices.name);
    return rows.map(toApi);
  }

  async getById(id: string) {
    const row = await this.db.query.devices.findFirst({ where: and(eq(devices.id, id), isNull(devices.deletedAt)) });
    if (!row) throw new ApiException('DEVICE_NOT_FOUND', `Device ${id} not found`);
    return toApi(row);
  }

  async create(input: CreateDeviceInput) {
    const ship = await this.db.query.ships.findFirst({ where: and(eq(ships.id, input.ship_id), isNull(ships.deletedAt)) });
    if (!ship) throw new ApiException('SHIP_NOT_FOUND', `Ship ${input.ship_id} not found`);
    // devices_ship_code_uq la unique(ship_id, code) -- kiem tra truoc de tra 409 ro rang thay vi de
    // rot xuong AllExceptionsFilter thanh 500 INTERNAL_ERROR (dung pattern tenants.service.ts).
    const existingDevice = await this.db.query.devices.findFirst({ where: and(eq(devices.shipId, input.ship_id), eq(devices.code, input.code), isNull(devices.deletedAt)) });
    if (existingDevice) throw new ApiException('RESOURCE_CONFLICT', `Device code '${input.code}' is already in use for this ship`, { code: input.code });

    const [row] = await this.db
      .insert(devices)
      .values({
        shipId: input.ship_id,
        code: input.code,
        name: input.name,
        role: input.role,
        model: input.model ?? null,
        serial: input.serial ?? null,
        architecture: input.architecture ?? null,
        routerosVersion: input.routeros_version ?? null,
        apiTransport: input.api_transport,
        credentialRef: input.credential_ref ?? null,
        mgmtEndpointRef: input.mgmt_endpoint_ref ?? null,
        pollIntervalS: input.poll_interval_s,
        ipAddress: input.ip_address ?? null,
        routerConfigText: input.router_config_text ?? null,
        ...(input.router_config_text ? { routerConfigUpdatedAt: new Date() } : {}),
      })
      .returning();

    await this.audit.record({ action: 'device.create', resourceType: 'device', resourceId: row.id, after: toApi(row), result: 'SUCCESS' });
    this.inventoryCache.invalidate();
    return toApi(row);
  }

  async update(id: string, input: UpdateDeviceInput) {
    const beforeRow = await this.db.query.devices.findFirst({ where: and(eq(devices.id, id), isNull(devices.deletedAt)) });
    if (!beforeRow) throw new ApiException('DEVICE_NOT_FOUND', `Device ${id} not found`);

    const [afterRow] = await this.db
      .update(devices)
      .set({
        ...(input.code !== undefined && { code: input.code }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.role !== undefined && { role: input.role }),
        ...(input.model !== undefined && { model: input.model }),
        ...(input.serial !== undefined && { serial: input.serial }),
        ...(input.architecture !== undefined && { architecture: input.architecture }),
        ...(input.routeros_version !== undefined && { routerosVersion: input.routeros_version }),
        ...(input.api_transport !== undefined && { apiTransport: input.api_transport }),
        ...(input.credential_ref !== undefined && { credentialRef: input.credential_ref }),
        ...(input.mgmt_endpoint_ref !== undefined && { mgmtEndpointRef: input.mgmt_endpoint_ref }),
        ...(input.poll_interval_s !== undefined && { pollIntervalS: input.poll_interval_s }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.ip_address !== undefined && { ipAddress: input.ip_address }),
        ...(input.router_config_text !== undefined && { routerConfigText: input.router_config_text, routerConfigUpdatedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    await this.audit.record({
      action: 'device.update',
      resourceType: 'device',
      resourceId: id,
      before: toApi(beforeRow),
      after: toApi(afterRow),
      diff: diffOf(toApi(beforeRow), toApi(afterRow)),
      result: 'SUCCESS',
    });
    this.inventoryCache.invalidate();
    return toApi(afterRow);
  }

  async remove(id: string) {
    const before = await this.db.query.devices.findFirst({ where: and(eq(devices.id, id), isNull(devices.deletedAt)) });
    if (!before) throw new ApiException('DEVICE_NOT_FOUND', `Device ${id} not found`);

    await this.db.update(devices).set({ deletedAt: new Date() }).where(eq(devices.id, id));
    await this.audit.record({ action: 'device.delete', resourceType: 'device', resourceId: id, before: toApi(before), result: 'SUCCESS' });
    this.inventoryCache.invalidate();
  }

  /**
   * Traffic theo bucket cho một thiết bị — tái dùng đúng pattern/bucket helper của
   * DashboardService.getTimeseries (dashboard.service.ts) nhưng lọc theo device_id thay vì ship_id.
   * Khác Reconciliation (throw khi thiếu data): endpoint này thuộc họ "dashboard" nên trả 200 kèm
   * data_status INSUFFICIENT_DATA khi chưa có interface_counter_deltas nào, để FE tự hiển thị
   * DataStateNotice thay vì phải bắt lỗi.
   */
  async getTraffic(deviceId: string, query: DashboardQuery) {
    const device = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!device) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);
    const ship = await this.db.query.ships.findFirst({ where: eq(ships.id, device.shipId) });

    const period = resolvePeriod(query, query.timezone ?? ship?.timezone ?? 'UTC');
    const from = new Date(period.from);
    const to = new Date(period.to);
    const bucket = bucketSql(interfaceCounterDeltas.bucket, period.granularity, period.timezone);

    const rows = await this.db
      .select({
        bucket,
        accountingGroup: interfaceCounterDeltas.accountingGroup,
        downloadBytes: sql<string>`sum(case when ${interfaceCounterDeltas.accountingGroup} = 'WAN_INPUT' then ${interfaceCounterDeltas.dRxBytes} else ${interfaceCounterDeltas.dTxBytes} end)`,
        uploadBytes: sql<string>`sum(case when ${interfaceCounterDeltas.accountingGroup} = 'WAN_INPUT' then ${interfaceCounterDeltas.dTxBytes} else ${interfaceCounterDeltas.dRxBytes} end)`,
      })
      .from(interfaceCounterDeltas)
      .where(and(eq(interfaceCounterDeltas.deviceId, deviceId), gte(interfaceCounterDeltas.bucket, from), lte(interfaceCounterDeltas.bucket, to)))
      .groupBy(bucket, interfaceCounterDeltas.accountingGroup)
      .orderBy(bucket);

    const [wanTotalRow] = await this.db
      .select({
        dl: sql<string | null>`sum(${interfaceCounterDeltas.dRxBytes})`,
        ul: sql<string | null>`sum(${interfaceCounterDeltas.dTxBytes})`,
        rowCount: count(interfaceCounterDeltas.id),
      })
      .from(interfaceCounterDeltas)
      .where(
        and(
          eq(interfaceCounterDeltas.deviceId, deviceId),
          eq(interfaceCounterDeltas.accountingGroup, 'WAN_INPUT' as any),
          gte(interfaceCounterDeltas.bucket, from),
          lte(interfaceCounterDeltas.bucket, to),
        ),
      );
    const wanRowCount = Number(wanTotalRow?.rowCount ?? 0);
    const wanDownload = wanRowCount > 0 ? Number(wanTotalRow?.dl ?? 0) : null;
    const wanUpload = wanRowCount > 0 ? Number(wanTotalRow?.ul ?? 0) : null;

    const byBucket = new Map<string, Record<string, { download_bytes: number; upload_bytes: number }>>();
    for (const row of rows) {
      const key = toDate(row.bucket)!.toISOString();
      if (!byBucket.has(key)) byBucket.set(key, {});
      byBucket.get(key)![row.accountingGroup] = { download_bytes: Number(row.downloadBytes), upload_bytes: Number(row.uploadBytes) };
    }

    // Đối soát: tổng data thật đã lên server qua WAN so với tổng CREW+BUSINESS+MANAGEMENT đã đếm
    // được — tái dùng đúng công thức computeGap() của Reconciliation cấp tàu (dashboard.service.ts),
    // chỉ khác là lọc theo device_id thay vì ship_id. gapBytes > 0 nghĩa là có traffic WAN chưa được
    // gán vào interface CREW/BUSINESS/MANAGEMENT nào (vd interface còn NONE, hoặc traffic nội bộ).
    const countedTotals = rows.reduce(
      (acc, row) => {
        if (row.accountingGroup === 'CREW_ACCESS' || row.accountingGroup === 'BUSINESS_ACCESS' || row.accountingGroup === 'MANAGEMENT') {
          acc.dl += Number(row.downloadBytes);
          acc.ul += Number(row.uploadBytes);
          acc.rowCount += 1;
        }
        return acc;
      },
      { dl: 0, ul: 0, rowCount: 0 },
    );
    const countedDownload = countedTotals.rowCount > 0 ? countedTotals.dl : null;
    const countedUpload = countedTotals.rowCount > 0 ? countedTotals.ul : null;
    const downloadGap = computeGap(wanDownload, countedDownload);
    const uploadGap = computeGap(wanUpload, countedUpload);

    return {
      data: {
        device_id: deviceId,
        period,
        units: DASHBOARD_UNITS,
        data_status: rows.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
        wan: {
          download_bytes: wanDownload,
          upload_bytes: wanUpload,
        },
        reconciliation: {
          counted: { download_bytes: countedDownload, upload_bytes: countedUpload },
          gap: {
            download_bytes: downloadGap.gapBytes,
            download_pct: downloadGap.gapPct,
            upload_bytes: uploadGap.gapBytes,
            upload_pct: uploadGap.gapPct,
          },
        },
        points: [...byBucket.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([bucketIso, groups]) => ({
            bucket: bucketIso,
            wan: groups.WAN_INPUT ?? null,
            crew: groups.CREW_ACCESS ?? null,
            business: groups.BUSINESS_ACCESS ?? null,
            management: groups.MANAGEMENT ?? null,
          })),
      },
      meta: makeDashboardMeta(period, []),
    };
  }

  /**
   * Bandwidth + tổng data THEO TỪNG INTERFACE (khác getTraffic() ở trên chỉ gộp theo 4 nhóm
   * WAN/CREW/BUSINESS/MANAGEMENT). month_total tính từ đầu tháng UTC hiện tại đến "now" — không
   * cần cron reset: sang tháng mới thì mốc "đầu tháng" tự nhảy, tổng lại bắt đầu từ 0 một cách
   * tự nhiên vì interface_counter_deltas là chuỗi delta cộng dồn theo bucket thời gian thật.
   */
  async getInterfaceTraffic(deviceId: string, query: DashboardQuery) {
    const device = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!device) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);
    const ship = await this.db.query.ships.findFirst({ where: eq(ships.id, device.shipId) });

    const period = resolvePeriod(query, query.timezone ?? ship?.timezone ?? 'UTC');
    const from = new Date(period.from);
    const to = new Date(period.to);
    const bucket = bucketSql(interfaceCounterDeltas.bucket, period.granularity, period.timezone);

    const ifaceRows = await this.db.select().from(interfaces).where(eq(interfaces.deviceId, deviceId)).orderBy(interfaces.name);

    // Mẫu counter THÔ gần nhất (không phải delta) cho mỗi interface -- đúng nguyên văn những gì
    // MikroTik gửi lên lần cuối (rx/tx bytes cộng dồn + packets/errors/drops nếu router có gửi).
    const latestSampleByIface = new Map(
      await Promise.all(
        ifaceRows.map(async (iface) => {
          const latest = await this.db.query.interfaceCounterSamples.findFirst({
            where: eq(interfaceCounterSamples.interfaceId, iface.id),
            orderBy: [desc(interfaceCounterSamples.observedAt)],
          });
          return [iface.id, latest] as const;
        }),
      ),
    );

    // Nhận diện router tự báo (source_device_ref, vd /system identity) ở lần push gần nhất --
    // dữ liệu này MikroTik có gửi nhưng trước đây chưa hiển thị ở đâu cả.
    const lastRawEvent = await this.db.query.rawTelemetryEvents.findFirst({
      where: eq(rawTelemetryEvents.deviceId, deviceId),
      orderBy: [desc(rawTelemetryEvents.receivedAt)],
    });

    const chartRows = await this.db
      .select({
        interfaceId: interfaceCounterDeltas.interfaceId,
        bucket,
        rxBytes: sql<string>`sum(${interfaceCounterDeltas.dRxBytes})`,
        txBytes: sql<string>`sum(${interfaceCounterDeltas.dTxBytes})`,
      })
      .from(interfaceCounterDeltas)
      .where(and(eq(interfaceCounterDeltas.deviceId, deviceId), gte(interfaceCounterDeltas.bucket, from), lte(interfaceCounterDeltas.bucket, to)))
      .groupBy(interfaceCounterDeltas.interfaceId, bucket)
      .orderBy(bucket);

    // Reset hàng tháng theo UTC (00:00 UTC ngày 1) -- thuần tính toán bằng mốc thời gian, không lưu
    // trạng thái "đã reset" ở đâu cả, nên không có rủi ro quên chạy job / lệch múi giờ.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const monthRows = await this.db
      .select({
        interfaceId: interfaceCounterDeltas.interfaceId,
        rxBytes: sql<string | null>`sum(${interfaceCounterDeltas.dRxBytes})`,
        txBytes: sql<string | null>`sum(${interfaceCounterDeltas.dTxBytes})`,
        sampleCount: count(interfaceCounterDeltas.id),
      })
      .from(interfaceCounterDeltas)
      .where(and(eq(interfaceCounterDeltas.deviceId, deviceId), gte(interfaceCounterDeltas.bucket, monthStart), lte(interfaceCounterDeltas.bucket, now)))
      .groupBy(interfaceCounterDeltas.interfaceId);

    const monthByIface = new Map(monthRows.map((row) => [row.interfaceId, row]));
    const chartByIface = new Map<string, Array<{ bucket: string; rx: number; tx: number }>>();
    for (const row of chartRows) {
      const key = row.interfaceId;
      if (!chartByIface.has(key)) chartByIface.set(key, []);
      chartByIface.get(key)!.push({ bucket: toDate(row.bucket)!.toISOString(), rx: Number(row.rxBytes), tx: Number(row.txBytes) });
    }

    const interfacesOut = ifaceRows.map((iface) => {
      const monthRow = monthByIface.get(iface.id);
      const hasMonthData = (monthRow?.sampleCount ?? 0) > 0;
      const latest = latestSampleByIface.get(iface.id);
      return {
        interface_id: iface.id,
        name: iface.name,
        accounting_group: iface.accountingGroup,
        points: (chartByIface.get(iface.id) ?? [])
          .sort((a, b) => a.bucket.localeCompare(b.bucket))
          .map((p) => ({ bucket: p.bucket, rx_bytes: p.rx, tx_bytes: p.tx })),
        month_total: {
          from: monthStart.toISOString(),
          to: now.toISOString(),
          rx_bytes: hasMonthData ? Number(monthRow!.rxBytes ?? 0) : null,
          tx_bytes: hasMonthData ? Number(monthRow!.txBytes ?? 0) : null,
          total_bytes: hasMonthData ? Number(monthRow!.rxBytes ?? 0) + Number(monthRow!.txBytes ?? 0) : null,
        },
        // Nguyên văn payload MikroTik gửi lần gần nhất (counter cộng dồn, không phải delta) --
        // packets/errors/drops chỉ khác null khi router thật sự gửi trường đó.
        latest_sample: latest
          ? {
              observed_at: latest.observedAt.toISOString(),
              rx_bytes: latest.rxBytes,
              tx_bytes: latest.txBytes,
              rx_packets: latest.rxPackets,
              tx_packets: latest.txPackets,
              rx_errors: latest.rxErrors,
              tx_errors: latest.txErrors,
              rx_drops: latest.rxDrops,
              tx_drops: latest.txDrops,
            }
          : null,
      };
    });

    return {
      data: {
        device_id: deviceId,
        period,
        units: DASHBOARD_UNITS,
        data_status: chartRows.length > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
        interfaces: interfacesOut,
        // Router tự báo identity (vd /system identity name) ở lần push gần nhất -- chưa từng hiển
        // thị ở đâu trước đây dù MikroTik luôn gửi kèm trong body push.
        last_push: lastRawEvent
          ? { identity: lastRawEvent.sourceDeviceRef, received_at: lastRawEvent.receivedAt.toISOString() }
          : null,
      },
      meta: makeDashboardMeta(period, []),
    };
  }

  /**
   * Cấp API key push mới cho thiết bị (model push 1 chiều — xem migrations/control/0007).
   * Key thật CHỈ trả về đúng 1 lần ở response này; từ sau đó server chỉ giữ sha256(key).
   */
  async issuePushApiKey(deviceId: string) {
    const device = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!device) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);

    const rawKey = randomBytes(32).toString('hex');
    const issuedAt = new Date();
    await this.db
      .update(devices)
      .set({ apiKeyHash: sha256Hex(rawKey), apiKeyIssuedAt: issuedAt, updatedAt: issuedAt })
      .where(eq(devices.id, deviceId));

    await this.audit.record({ action: 'device.push_key_issue', resourceType: 'device', resourceId: deviceId, result: 'SUCCESS' });
    // Plain object (không { data, meta }) — EnvelopeInterceptor tự bọc, giống create()/update().
    return { api_key: rawKey, issued_at: issuedAt.toISOString() };
  }

  /** Thu hồi API key push — thiết bị dùng key cũ sẽ nhận DEVICE_PUSH_UNAUTHORIZED ở lần push kế tiếp. */
  async revokePushApiKey(deviceId: string) {
    const device = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!device) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);

    await this.db.update(devices).set({ apiKeyHash: null, apiKeyIssuedAt: null, updatedAt: new Date() }).where(eq(devices.id, deviceId));
    await this.audit.record({ action: 'device.push_key_revoke', resourceType: 'device', resourceId: deviceId, result: 'SUCCESS' });
  }

  /**
   * Cấp RADIUS secret mới cho thiết bị — sinh ngẫu nhiên qua EnvSecretStore (xem file đó để biết vì
   * sao "env:" chỉ tạm thời, ADR-05), tự đặt credential_ref trỏ tới biến vừa tạo. Nếu thiết bị đã có
   * credential_ref env:CU từ trước, thu hồi biến cũ luôn để không rò rỉ secret bỏ đi trong .env.
   * Secret thật CHỈ trả về đúng 1 lần ở response này — RADIUS Accounting-Request kế tiếp từ router
   * dùng được ngay (EnvCredentialResolver đọc process.env trực tiếp, không cache).
   */
  async issueRadiusSecret(deviceId: string) {
    const device = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!device) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);

    if (device.credentialRef?.startsWith('env:')) {
      this.secrets.revoke(device.credentialRef.slice('env:'.length));
    }

    const varName = buildRadiusSecretVarName(device.code);
    const secret = this.secrets.issue(varName);
    const credentialRef = `env:${varName}`;
    const issuedAt = new Date();
    await this.db.update(devices).set({ credentialRef, radiusSecretIssuedAt: issuedAt, updatedAt: issuedAt }).where(eq(devices.id, deviceId));

    await this.audit.record({ action: 'device.radius_secret_issue', resourceType: 'device', resourceId: deviceId, result: 'SUCCESS' });
    // Cache giữ nguyên devices.credential_ref cũ tới chu kỳ làm mới kế tiếp (tối đa 20s) nếu không
    // invalidate ngay — RadiusServerService sẽ verify secret MỚI cấp thất bại trong lúc đó.
    this.inventoryCache.invalidate();
    return { credential_ref: credentialRef, secret, issued_at: issuedAt.toISOString() };
  }

  /** Thu hồi RADIUS secret — router dùng secret cũ sẽ bị Accounting-Request từ chối ở gói kế tiếp. */
  async revokeRadiusSecret(deviceId: string) {
    const device = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!device) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);

    if (device.credentialRef?.startsWith('env:')) {
      this.secrets.revoke(device.credentialRef.slice('env:'.length));
    }
    await this.db.update(devices).set({ credentialRef: null, radiusSecretIssuedAt: null, updatedAt: new Date() }).where(eq(devices.id, deviceId));
    await this.audit.record({ action: 'device.radius_secret_revoke', resourceType: 'device', resourceId: deviceId, result: 'SUCCESS' });
    this.inventoryCache.invalidate();
  }

  /**
   * Nhận telemetry MikroTik tự đẩy lên (POST /devices/:id/telemetry-push, header X-Device-Api-Key).
   * Đây là router tự xác thực bằng key riêng của nó — KHÔNG đi qua AuthStubGuard/x-actor-permissions,
   * nên tự kiểm tra key thủ công ở đây trước khi làm gì khác.
   */
  async ingestPush(deviceId: string, apiKey: string | undefined, body: DeviceTelemetryPushInput) {
    const device = await this.db.query.devices.findFirst({ where: and(eq(devices.id, deviceId), isNull(devices.deletedAt)) });
    if (!device) throw new ApiException('DEVICE_NOT_FOUND', `Device ${deviceId} not found`);

    if (!device.apiKeyHash) {
      throw new ApiException('DEVICE_PUSH_NOT_CONFIGURED', `Device ${deviceId} has no push API key issued yet — call POST /devices/${deviceId}/push-key first`);
    }
    const suppliedHash = apiKey ? sha256Hex(apiKey) : null;
    if (!suppliedHash || suppliedHash !== device.apiKeyHash) {
      throw new ApiException('DEVICE_PUSH_UNAUTHORIZED', 'Missing or invalid X-Device-Api-Key header');
    }

    // Tự động đăng ký interface lần đầu thấy trong 1 push (accounting_group mặc định NONE, an toàn
    // -- KHÔNG tự suy đoán WAN/CREW/BUSINESS thay người dùng). Nếu thiếu bước này, những interface
    // chưa có trong bảng `interfaces` sẽ mãi UNRESOLVED_INTERFACE (raw vẫn lưu, không mất, nhưng
    // không bao giờ lên được dashboard) cho tới khi có người tạo tay qua API -- điều đã xảy ra thật
    // với thiết bị test trước khi sửa chỗ này, khiến 1 tàu mới thêm script vào tưởng như "không chạy".
    const existingIfaces = await this.db.select({ name: interfaces.name }).from(interfaces).where(eq(interfaces.deviceId, deviceId));
    const existingNames = new Set(existingIfaces.map((row) => row.name));
    const newNames = [...new Set(body.interfaces.map((iface) => iface.name))].filter((name) => !existingNames.has(name));
    if (newNames.length > 0) {
      await this.db
        .insert(interfaces)
        .values(newNames.map((name) => ({ deviceId, name, type: 'ETHER' as const })))
        .onConflictDoNothing({ target: [interfaces.deviceId, interfaces.name] });
    }

    const observedAt = new Date();
    const target: CollectorTarget = {
      shipId: device.shipId,
      deviceId: device.id,
      host: body.ip_address ?? device.ipAddress ?? '',
      port: 0,
      timeoutMs: 0,
      sourceDeviceRef: body.identity ?? device.code,
    };

    const events = body.interfaces.map((iface) =>
      interfaceCounterReadingToEvent(
        target,
        {
          interfaceName: iface.name,
          interfaceId: null,
          observedAt,
          rxBytes: iface.rx_byte,
          txBytes: iface.tx_byte,
          rxPackets: iface.rx_packet ?? null,
          txPackets: iface.tx_packet ?? null,
          rxErrors: iface.rx_error ?? null,
          txErrors: iface.tx_error ?? null,
        },
        'routeros-push',
      ),
    );

    const ingestResult = await this.telemetry.ingest({ events });

    // Tự hiệu chỉnh poll_interval_s theo nhịp push THẬT của router. Field này mặc định 60s (di sản
    // từ model poll cũ) nhưng model push cho phép router chạy Scheduler ở BẤT KỲ interval nào (vd
    // 300s) -- nếu để nguyên 60s, computeCounterDelta() (gigawords.ts) coi elapsed_s > 3*60=180s là
    // "gap qua lon" va gan quality=DEGRADED cho MOI delta binh thuong, du khong mat du lieu gi ca.
    // Chi cap nhat khi lech > 50% de tranh ghi lien tuc vi dao dong nho (vd 298s/301s/295s).
    let pollIntervalUpdate: number | undefined;
    if (device.lastSeenAt) {
      const observedIntervalS = Math.round((observedAt.getTime() - device.lastSeenAt.getTime()) / 1000);
      if (observedIntervalS >= 5 && observedIntervalS <= 3600 && Math.abs(observedIntervalS - device.pollIntervalS) > device.pollIntervalS * 0.5) {
        pollIntervalUpdate = observedIntervalS;
      }
    }

    await this.db
      .update(devices)
      .set({
        lastSeenAt: observedAt,
        status: 'ONLINE',
        ...(body.ip_address !== undefined && body.ip_address !== null && { ipAddress: body.ip_address }),
        ...(pollIntervalUpdate !== undefined && { pollIntervalS: pollIntervalUpdate }),
        updatedAt: observedAt,
      })
      .where(eq(devices.id, deviceId));

    return {
      accepted: ingestResult.data.accepted_count,
      duplicate: ingestResult.data.duplicate_count,
      last_seen_at: observedAt.toISOString(),
    };
  }
}
