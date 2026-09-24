import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { adminUsers, tenants } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { verifyPassword } from '@password-hash/password-hash';
import { EnvSecretStore } from '@secrets/env-secret-store';
import { signToken, verifyToken, TokenPayload } from '@auth-stub/token';
import { TENANT_PERMISSIONS } from '@auth-stub/permissions';

// Bang quyen chuyen sang @auth-stub/permissions.ts de guard va service dung CHUNG mot nguon.

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
    // 1) Tai khoan quan tri THAT trong database (bang admin_users, migration 0015). Day la nguon
    //    chinh — tra truoc bien moi truong, de khi da co tai khoan that thi no quyet dinh.
    const admin = username
      ? await this.db.query.adminUsers.findFirst({
          where: and(eq(adminUsers.username, username), isNull(adminUsers.deletedAt)),
        })
      : undefined;

    if (admin) {
      if (admin.status !== 'ACTIVE') {
        throw new ApiException('UNAUTHENTICATED', 'Tài khoản đã bị khoá.');
      }
      if (!verifyPassword(password ?? '', admin.passwordHash)) {
        // KHONG rot xuong cac nhanh duoi. Username nay la mot admin that; sai mat khau thi dung
        // han o day, neu khong mot lan go nham lai di tiep sang nhanh du phong.
        throw new ApiException('UNAUTHENTICATED', 'Sai username hoặc mật khẩu.');
      }
      await this.db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, admin.id));
      const token = signToken({ sub: admin.id, role: 'admin', name: admin.name }, this.getSecret());
      return { token, id: admin.id, name: admin.name, role: 'admin', permissions: '*' };
    }

    // 2) Duong vao du phong bang bien moi truong — chi de tao duoc tai khoan dau tien khi
    //    admin_users con rong. Xem scripts/create-admin.ts.
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

    // FAIL CLOSED. Ban truoc: khi chua cau hinh superadmin thi BAT KY username/password nao cung
    // duoc cap token admin toan quyen -- mot he thong vua cai dat la mo toang cho toi khi co nguoi
    // nho sua .env, va khong co gi bao cho ho biet dieu do.
    //
    // Thong bao phan biet 2 tinh huong khac han nhau, vi truoc day gop lam mot la noi sai voi
    // nguoi dung: he thong DA co tai khoan ma bao "chua cau hinh tai khoan quan tri" thi ho se di
    // sua .env thay vi kiem tra lai username minh vua go.
    const [{ count: adminCount }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminUsers)
      .where(and(isNull(adminUsers.deletedAt), eq(adminUsers.status, 'ACTIVE')));

    if (adminCount > 0) {
      throw new ApiException('UNAUTHENTICATED', 'Sai username hoặc mật khẩu.');
    }
    throw new ApiException(
      'UNAUTHENTICATED',
      'Chưa có tài khoản quản trị nào. Chạy: npm run admin:create -- --username=<tên> --name="<họ tên>"',
    );
  }

  me(bearerToken?: string) {
    const decoded = bearerToken ? this.tryVerify(bearerToken) : null;
    if (decoded?.role === 'tenant') {
      return { id: decoded.tenant_id ?? decoded.sub, name: decoded.name, role: 'tenant' };
    }
    if (decoded?.role === 'admin') return { id: decoded.sub, name: decoded.name, role: 'admin' };
    // Khong con bia ra danh tinh "Dev Actor" vai tro admin khi thieu token. Tra ve danh tinh admin
    // cho mot request chua xac thuc la noi doi voi chinh giao dien, va che mat loi token het han.
    throw new ApiException('UNAUTHENTICATED', 'Chưa đăng nhập hoặc token đã hết hạn.');
  }

  private tryVerify(token: string): TokenPayload | null {
    try {
      return verifyToken(token, this.getSecret());
    } catch {
      return null;
    }
  }
}
