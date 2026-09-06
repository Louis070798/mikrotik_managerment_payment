import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ulid } from 'ulid';

/**
 * ==========================================================================
 * TAM THOI — cau noi cho AuthStubGuard (xem src/libs/auth-stub/auth-stub.guard.ts).
 * Auth/RBAC that (module 1 cua 03-API_DESIGN.md) chua nam trong pham vi hien tai.
 * Endpoint nay chap nhan moi username/password va tra token gia; frontend dung
 * token nay chi de biet "da dang nhap" o tang UI (ProtectedRoute), quyen thuc te
 * van do header x-actor-permissions quyet dinh o moi request rieng.
 * Khi Auth/RBAC that duoc trien khai, thay noi dung controller nay, khong doi contract.
 * ==========================================================================
 */
@Controller('auth')
export class AuthController {
  @Post('login')
  @HttpCode(200)
  login(@Body() _body: { username?: string; password?: string }) {
    return { token: ulid() };
  }

  @Get('me')
  me() {
    return { id: 'dev-actor', name: 'Dev Actor', role: 'admin' };
  }
}
