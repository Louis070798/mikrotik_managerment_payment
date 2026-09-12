import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * ==========================================================================
 * NANG CAP 2026-09-07: tenant co the dang nhap that (username/password scrypt, xem
 * tenants.service.ts issuePassword()). Van con LA "khung" — chua phai Auth/RBAC module day du
 * (module 1 cua 03-API_DESIGN.md): quyen tenant la 1 whitelist chung cung cap toan he thong
 * (xem AuthService), CHUA loc du lieu theo tung tenant_id trong tung service. Voi username
 * KHONG khop 1 tenant that (hoac tenant chua cap mat khau), hanh vi CU van giu nguyen: chap
 * nhan bat ky mat khau nao, vai tro "admin" — khong pha luong dev/test hien co.
 * ==========================================================================
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { username?: string; password?: string }) {
    return this.service.login(body?.username ?? '', body?.password ?? '');
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    return this.service.me(token);
  }
}
