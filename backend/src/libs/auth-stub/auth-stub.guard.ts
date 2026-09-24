import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '@common/api-exception';
import { EnvSecretStore } from '@secrets/env-secret-store';
import { verifyToken } from './token';
import { permissionsForRole } from './permissions';

/**
 * Guard phan quyen THAT — suy quyen tu token da ky, khong tu header do client gui.
 *
 * LICH SU (de khong ai vo tinh khoi phuc): ban truoc doc thang `x-actor-permissions` tu header
 * request roi so voi @RequirePermission(). Vi guard nay dang ky GLOBAL, nghia la bat ky ai cham
 * duoc cong 3000 chi can gui kem `-H 'x-actor-permissions: *'` la co toan quyen tren moi endpoint
 * — thiet bi, tenant, subscriber, settings, va ca secret RADIUS cua ca ham doi. Token HMAC van
 * duoc cap luc dang nhap nhung chua bao gio duoc kiem o day, nen no chi la do trang tri.
 *
 * Gio: Authorization: Bearer <token> -> verifyToken() (chu ky + han dung) -> quyen suy ra tu
 * `role` trong payload qua permissionsForRole(). Client khong con tieng noi nao trong viec minh
 * co quyen gi.
 *
 * Endpoint khong gan @RequirePermission van di qua tu do — do la co y: router tu day telemetry
 * (POST /devices/:id/telemetry-push) xac thuc bang X-Device-Api-Key rieng, khong phai actor nguoi
 * dung, va /auth/login thi hien nhien khong the doi token truoc khi dang nhap.
 */
export const PERMISSION_KEY = 'required_permission';
export const RequirePermission = (...permissions: string[]) => SetMetadata(PERMISSION_KEY, permissions);

export const TENANT_SCOPED_KEY = 'tenant_scoped';
/**
 * Danh dau mot handler DA duoc kiem chung la loc du lieu theo tenant cua actor.
 *
 * Vi sao can: TENANT_PERMISSIONS cap quyen theo loai hanh dong chu khong theo pham vi du lieu.
 * Mot endpoint co dashboard:read nhung tong hop tren MOI tau se lo du lieu cua dai ly khac cho
 * bat ky dai ly nao dang nhap. Danh sach endpoint nhu vay dai va de sot khi ra soat tay.
 *
 * Nen guard mac dinh TU CHOI actor vai tro tenant tren moi handler chua gan decorator nay. Sot
 * mot endpoint thi hau qua la "dai ly bao khong xem duoc" — phien toai nhung nhin thay ngay va sua
 * duoc; con chieu nguoc lai la ro ri du lieu im lang. Admin khong bi anh huong.
 */
export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);

@Injectable()
export class AuthStubGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly envStore: EnvSecretStore,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const raw = (req.headers['authorization'] as string) || '';
    const token = raw.startsWith('Bearer ') ? raw.slice('Bearer '.length).trim() : '';
    if (!token) {
      throw new ApiException('UNAUTHENTICATED', 'Thiếu Authorization: Bearer <token> — hãy đăng nhập lại.');
    }

    const secret = this.envStore.get('AUTH_TOKEN_SECRET');
    if (!secret) {
      // Fail closed. Thieu khoa ky thi khong the phan biet token that voi token gia, nen tu choi
      // tat ca thay vi cho qua.
      throw new ApiException('UNAUTHENTICATED', 'AUTH_TOKEN_SECRET chưa được cấu hình trên server.');
    }

    const payload = verifyToken(token, secret);
    if (!payload) {
      throw new ApiException('UNAUTHENTICATED', 'Token không hợp lệ hoặc đã hết hạn — hãy đăng nhập lại.');
    }

    // Gan danh tinh DA XAC THUC vao request de audit log lay tu day, khong lay tu header.
    req.actor = { id: payload.sub, name: payload.name, role: payload.role, tenantId: payload.tenant_id ?? null };

    if (payload.role === 'tenant') {
      const scoped = this.reflector.getAllAndOverride<boolean | undefined>(TENANT_SCOPED_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
      if (!scoped) {
        throw new ApiException(
          'FORBIDDEN',
          'Endpoint này chưa lọc dữ liệu theo đại lý nên tạm thời chỉ quản trị viên dùng được.',
          { required_permissions: required },
        );
      }
      if (!payload.tenant_id) {
        throw new ApiException('FORBIDDEN', 'Token vai trò đại lý nhưng thiếu tenant_id.');
      }
    }

    const granted = new Set(permissionsForRole(payload.role).split(',').map((p) => p.trim()).filter(Boolean));
    const ok = required.every((p) => granted.has(p) || granted.has('*'));
    if (!ok) {
      throw new ApiException('FORBIDDEN', `Missing permission: ${required.join(', ')}`, {
        required_permissions: required,
      });
    }
    return true;
  }
}
