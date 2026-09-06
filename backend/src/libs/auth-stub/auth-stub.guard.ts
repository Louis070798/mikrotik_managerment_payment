import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '@common/api-exception';

/**
 * ==========================================================================
 * KHUNG TẠM THỜI — không phải Auth/RBAC module thật (đó là module 1 của
 * 03-API_DESIGN.md, chưa nằm trong phạm vi "Inventory + Server Health").
 *
 * Guard này chỉ đọc header `x-actor-permissions` (CSV) do client dev/test tự khai,
 * KHÔNG xác thực chữ ký, KHÔNG dùng cho production. Nó tồn tại để:
 *   1. Chứng minh mọi endpoint ghi đều có permission check gắn sẵn (DoD backend).
 *   2. Giữ đúng chỗ cắm — khi Auth module thật (JWT + RBAC scope) được implement,
 *      chỉ cần thay nội dung guard này, KHÔNG cần đổi @RequirePermission() ở controller.
 * ==========================================================================
 */
export const PERMISSION_KEY = 'required_permission';
export const RequirePermission = (...permissions: string[]) => SetMetadata(PERMISSION_KEY, permissions);

@Injectable()
export class AuthStubGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const grantedHeader = (req.headers['x-actor-permissions'] as string) || '';
    const granted = new Set(
      grantedHeader
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    );

    const ok = required.every((p) => granted.has(p) || granted.has('*'));
    if (!ok) {
      throw new ApiException('FORBIDDEN', `Missing permission: ${required.join(', ')}`, {
        required_permissions: required,
      });
    }
    return true;
  }
}
