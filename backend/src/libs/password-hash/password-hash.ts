import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Băm/so khớp mật khẩu bằng scrypt (Node builtin, không thêm dependency bcrypt/argon2 mới —
 * cùng chủ trương chỉ dùng `crypto` chuẩn như env-secret-store.ts/devices.service.ts).
 * Dùng cho mật khẩu RADIUS thật của subscriber (PPPoE/Hotspot) — khác với `credential_ref`
 * kiểu "env:VAR" của thiết bị (ADR-05, dành cho secret hạ tầng), vì đây là hash 1 chiều của
 * chính hệ thống này, không phải secret trỏ tới hệ thống khác.
 */
const KEY_LEN = 64;
const SALT_LEN = 16;

export function hashPassword(plaintext: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(plaintext, salt, KEY_LEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plaintext: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plaintext, salt, KEY_LEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
