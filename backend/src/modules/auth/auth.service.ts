import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { tenants } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { verifyPassword } from '@password-hash/password-hash';
import { EnvSecretStore } from '@secrets/env-secret-store';
import { signToken, verifyToken, TokenPayload } from '@auth-stub/token';

/**
 * Whitelist THU CONG cho tai khoan "tenant" that (khac "admin" — luon la '*'). Loai tru cac
 * quyen ha tang/to chuc: settings:*, endpoint:* (Cai dat — chi Superadmin), inventory:write
 * (cau truc ham doi), package:write (gia goi cuoc), tenant:write (tao/sua tenant khac — tranh
 * leo thang quyen qua chinh co che nay), zerotier:write, audit:read (log toan he thong).
 *
 * GIOI HAN THAT (chua giai quyet o buoc nay): day la 1 danh sach quyen CHUNG, chua phai scope
 * theo TUNG tenant — 1 tenant dang nhap voi subscriber:read van thay duoc subscriber cua MOI
 * tenant khac, khong chi cua minh (chua co loc tenant_id trong tung service). Can 1 buoc rieng
 * (loc du lieu theo request.actor.tenant_id trong moi service) de that su cach ly du lieu.
 */
const TENANT_PERMISSIONS = [
  'alert:ack', 'alert:read', 'business:read', 'crew:read', 'crew:write', 'dashboard:read',
  'finance:read', 'health:read', 'inventory:read', 'package:read', 'raw:read',
  'reconciliation:read', 'subscriber:read', 'subscriber:write', 'tenant:read',
].join(',');

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly envStore: EnvSecretStore,
  ) {}

  private getSecret(): string {
    return this.envStore.get('AUTH_TOKEN_SECRET') ?? this.envStore.issue('AUTH_TOKEN_SECRET');
  }

  async login(username: string, password: string) {
    const superadminUsername = this.envStore.get('SUPERADMIN_USERNAME');
    const superadminHash = this.envStore.get('SUPERADMIN_PASSWORD_HASH');
    const hasRealSuperadmin = !!superadminUsername && !!superadminHash;

    if (hasRealSuperadmin && username === superadminUsername) {
      if (!verifyPassword(password ?? '', superadminHash!)) {
        throw new ApiException('UNAUTHENTICATED', 'Sai username hoặc mật khẩu.');
      }
      const token = signToken({ sub: 'superadmin', role: 'admin', name: 'Superadmin' }, this.getSecret());
      return { token, id: 'superadmin', name: 'Superadmin', role: 'admin', permissions: '*' };
    }

    const tenant = username
      ? await this.db.query.tenants.findFirst({ where: and(eq(tenants.username, username), isNull(tenants.deletedAt)) })
      : undefined;

    if (tenant?.passwordHash) {
      // username nay THAT SU la 1 tai khoan tenant da cap mat khau -- phai dung mat khau, KHONG
      // fallback ve admin neu sai (tranh 1 lan go nham username/password lai duoc quyen admin).
      if (!verifyPassword(password ?? '', tenant.passwordHash)) {
        throw new ApiException('UNAUTHENTICATED', 'Sai username hoặc mật khẩu.');
      }
      const token = signToken({ sub: tenant.id, role: 'tenant', name: tenant.name, tenant_id: tenant.id }, this.getSecret());
      return { token, id: tenant.id, name: tenant.name, role: 'tenant', permissions: TENANT_PERMISSIONS };
    }

    if (hasRealSuperadmin) {
      // Da co it nhat 1 tai khoan that (superadmin) duoc cau hinh -- KHONG con fallback "vao duoc
      // voi bat ky gi" nua, neu khong tai khoan superadmin vua tao se vo nghia (ai cung vao duoc
      // admin bang bat ky mat khau nao).
      throw new ApiException('UNAUTHENTICATED', 'Sai username hoặc mật khẩu.');
    }

    // Fallback CHI khi CHUA TUNG cau hinh superadmin that nao -- giu dung hanh vi dev cu (chap
    // nhan bat ky username/password nao, vai tro admin) de khong khoa het moi nguoi ra ngoai
    // truoc khi ho kip tao tai khoan that dau tien.
    const token = signToken({ sub: 'dev-actor', role: 'admin', name: 'Dev Actor' }, this.getSecret());
    return { token, id: 'dev-actor', name: 'Dev Actor', role: 'admin', permissions: '*' };
  }

  me(bearerToken?: string) {
    const decoded = bearerToken ? this.tryVerify(bearerToken) : null;
    if (decoded?.role === 'tenant') {
      return { id: decoded.tenant_id ?? decoded.sub, name: decoded.name, role: 'tenant' };
    }
    // Token that (superadmin) giai ma duoc -> tra dung danh tinh do; khong co token/khong giai ma
    // duoc (chua dang nhap qua UI, vd goi API truc tiep) -> fallback "Dev Actor" nhu cu.
    if (decoded?.role === 'admin') return { id: decoded.sub, name: decoded.name, role: 'admin' };
    return { id: 'dev-actor', name: 'Dev Actor', role: 'admin' };
  }

  private tryVerify(token: string): TokenPayload | null {
    try {
      return verifyToken(token, this.getSecret());
    } catch {
      return null;
    }
  }
}
