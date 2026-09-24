import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AAA_DB_TOKEN, type AaaDbClient } from '@db-aaa/db-aaa.module';
import { nas, radcheck, radreply } from '@db-aaa/schema';

export type SubscriberAaaState = {
  username: string;
  /** Plaintext. Undefined = giu nguyen mat khau dang co trong radcheck. */
  password?: string;
  /** Chi ACTIVE moi duoc dang nhap. */
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  expiresAt?: Date | null;
  downMbps?: number | null;
  upMbps?: number | null;
};

/** Dinh dang FreeRADIUS doc duoc cho thuoc tinh Expiration (rlm_expiration). */
function formatExpiration(d: Date): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Ghi AAA that sang PostgreSQL cua FreeRADIUS — radcheck/radreply cho subscriber, nas cho thiet bi.
 *
 * Chi hoat dong khi RADIUS_MODE=freeradius. O che do embedded, moi phuong thuc deu la no-op: nguon
 * su that luc do la subscribers.password_hash + devices.credential_ref trong control DB, ghi sang
 * day nua chi tao ra hai ban ghi de lech nhau.
 *
 * MAT KHAU LUU CLEARTEXT, co chu dich: MikroTik hotspot mac dinh dang nhap bang CHAP, ma CHAP buoc
 * server phai giu duoc gia tri that de tinh lai hash thu thach — khong the so sanh bang ban bam mot
 * chieu. Muon luu dang bam thi phai ep hotspot dung `login-by=http-pap` trong /ip hotspot profile.
 * Day la danh doi da biet truoc, khong phai so suat.
 *
 * Vi the `subscribers.password_hash` (scrypt, mot chieu) KHONG chuyen doi duoc sang radcheck — user
 * cu phai duoc cap lai mat khau. Goi setPassword() la cach duy nhat dua mot user sang FreeRADIUS.
 */
@Injectable()
export class FreeradiusAaaService {
  private readonly logger = new Logger(FreeradiusAaaService.name);

  constructor(@Optional() @Inject(AAA_DB_TOKEN) private readonly aaa: AaaDbClient | null) {}

  /** true khi he thong dang chay voi FreeRADIUS VA co ket noi toi DB cua no. */
  get enabled(): boolean {
    return process.env.RADIUS_MODE === 'freeradius' && this.aaa !== null;
  }

  private async setAttr(table: typeof radcheck | typeof radreply, username: string, attribute: string, op: string, value: string) {
    if (!this.aaa) return;
    // Khong dung onConflictDoUpdate: radreply khong co unique index tren (username, attribute),
    // nen upsert that se im lang khong lam gi. Xoa roi chen lai la cach duy nhat dung cho ca hai bang.
    await this.aaa.delete(table).where(and(eq(table.username, username), eq(table.attribute, attribute)));
    await this.aaa.insert(table).values({ username, attribute, op, value });
  }

  private async clearAttr(table: typeof radcheck | typeof radreply, username: string, attribute: string) {
    if (!this.aaa) return;
    await this.aaa.delete(table).where(and(eq(table.username, username), eq(table.attribute, attribute)));
  }

  /**
   * Dong bo mot subscriber sang radcheck/radreply. Goi sau moi thay doi thuc su anh huong toi
   * quyen dang nhap: tao, doi goi cuoc, doi trang thai, doi han, dat lai mat khau.
   */
  async upsertSubscriber(state: SubscriberAaaState): Promise<void> {
    if (!this.enabled) return;
    try {
      if (state.password !== undefined) {
        await this.setAttr(radcheck, state.username, 'Cleartext-Password', ':=', state.password);
      }

      // SUSPENDED/EXPIRED: chan bang Auth-Type := Reject thay vi xoa mat khau. Xoa thi khi mo khoa
      // lai phai cap mat khau moi; chan thi bo dong nay la dang nhap duoc ngay voi mat khau cu.
      if (state.status === 'ACTIVE') {
        await this.clearAttr(radcheck, state.username, 'Auth-Type');
      } else {
        await this.setAttr(radcheck, state.username, 'Auth-Type', ':=', 'Reject');
      }

      if (state.expiresAt) {
        await this.setAttr(radcheck, state.username, 'Expiration', ':=', formatExpiration(state.expiresAt));
      } else {
        await this.clearAttr(radcheck, state.username, 'Expiration');
      }

      // Toc do theo goi cuoc. RouterOS doc Mikrotik-Rate-Limit dang "<up>/<down>" (up truoc).
      if (state.upMbps && state.downMbps) {
        await this.setAttr(radreply, state.username, 'Mikrotik-Rate-Limit', ':=', `${state.upMbps}M/${state.downMbps}M`);
      } else {
        await this.clearAttr(radreply, state.username, 'Mikrotik-Rate-Limit');
      }
    } catch (err) {
      // Khong nem tiep: control DB da ghi xong, huy ca request chi vi FreeRADIUS tam thoi khong toi
      // duoc se de lai trang thai nua voi. Log ro de con doi soat lai.
      this.logger.error(`Không ghi được AAA cho "${state.username}" sang FreeRADIUS: ${(err as Error).message}`);
    }
  }

  /** Xoa hoan toan mot user khoi FreeRADIUS (khi xoa subscriber hoac thu hoi mat khau). */
  async removeSubscriber(username: string): Promise<void> {
    if (!this.enabled || !this.aaa) return;
    try {
      await this.aaa.delete(radcheck).where(eq(radcheck.username, username));
      await this.aaa.delete(radreply).where(eq(radreply.username, username));
    } catch (err) {
      this.logger.error(`Không xoá được AAA của "${username}" khỏi FreeRADIUS: ${(err as Error).message}`);
    }
  }

  /**
   * Dong bo mot NAS (thiet bi MikroTik) sang bang `nas`.
   *
   * LUU Y VAN HANH: FreeRADIUS chi doc bang nas LUC KHOI DONG (chu thich trong mods-available/sql:
   * "Clients will ONLY be read on server startup"). Ghi xong o day thi secret moi CHUA co hieu luc
   * — phai restart FreeRADIUS. Backend chay tren may khac nen khong tu restart duoc; giao dien phai
   * noi ro dieu do cho admin thay vi de ho tuong da xong.
   */
  async upsertNas(ipAddress: string, shortname: string, secret: string, description?: string): Promise<void> {
    if (!this.enabled || !this.aaa) return;
    try {
      await this.aaa.delete(nas).where(eq(nas.nasname, ipAddress));
      await this.aaa.insert(nas).values({
        nasname: ipAddress,
        shortname: shortname.slice(0, 32),
        type: 'other',
        secret: secret.slice(0, 60),
        description: description?.slice(0, 200) ?? null,
      });
      this.logger.log(`Đã ghi NAS ${ipAddress} (${shortname}) vào FreeRADIUS — CẦN RESTART FreeRADIUS để có hiệu lực.`);
    } catch (err) {
      this.logger.error(`Không ghi được NAS ${ipAddress} sang FreeRADIUS: ${(err as Error).message}`);
    }
  }

  async removeNas(ipAddress: string): Promise<void> {
    if (!this.enabled || !this.aaa) return;
    try {
      await this.aaa.delete(nas).where(eq(nas.nasname, ipAddress));
    } catch (err) {
      this.logger.error(`Không xoá được NAS ${ipAddress} khỏi FreeRADIUS: ${(err as Error).message}`);
    }
  }
}
