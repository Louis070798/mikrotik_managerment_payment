import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * ==========================================================================
 * TẠM THỜI, đúng như EnvCredentialResolver (health-checks/credential-resolver.ts) — vế GHI của
 * cùng cơ chế "env:TEN_BIEN" (ADR-05: SecretProvider + envelope encryption thật chưa xây). Sinh 1
 * secret ngẫu nhiên, gán vào process.env NGAY (EnvCredentialResolver đọc process.env trực tiếp mỗi
 * lần verify, không cache — gói RADIUS Accounting-Request tiếp theo dùng được ngay không cần
 * restart) và ghi xuống file .env ở process.cwd() để sống sót qua lần restart kế tiếp.
 *
 * CHỈ đúng cho triển khai 1 tiến trình/dev-pilot — nhiều replica sẽ có bản .env riêng, không đồng
 * bộ. KHÔNG dùng cho production nhiều instance thật.
 * ==========================================================================
 */
@Injectable()
export class EnvSecretStore {
  private readonly logger = new Logger(EnvSecretStore.name);
  private readonly envPath = join(process.cwd(), '.env');

  /** Sinh secret ngẫu nhiên (24 byte -> 48 ký tự hex), gán vào process.env[varName] + ghi xuống .env. */
  issue(varName: string): string {
    const value = randomBytes(24).toString('hex');
    process.env[varName] = value;
    this.upsertLine(varName, value);
    return value;
  }

  /** Xoá khỏi process.env + xoá dòng khỏi .env (nếu có). */
  revoke(varName: string): void {
    delete process.env[varName];
    this.removeLine(varName);
  }

  private readLines(): string[] {
    if (!existsSync(this.envPath)) return [];
    return readFileSync(this.envPath, 'utf8').split('\n');
  }

  private writeLines(lines: string[]): void {
    try {
      writeFileSync(this.envPath, lines.join('\n'));
    } catch (err) {
      // .env không ghi được (vd read-only trong một số môi trường triển khai) không nên chặn
      // request — secret vẫn dùng được trong tiến trình hiện tại (đã set process.env), chỉ không
      // sống sót qua lần restart kế tiếp.
      this.logger.warn(`Không ghi được .env (secret vẫn dùng được tới khi restart): ${(err as Error).message}`);
    }
  }

  private upsertLine(varName: string, value: string): void {
    const lines = this.readLines();
    const pattern = new RegExp(`^${varName}=`);
    const idx = lines.findIndex((l) => pattern.test(l));
    const newLine = `${varName}=${value}`;
    if (idx >= 0) lines[idx] = newLine;
    else lines.push(newLine);
    this.writeLines(lines);
  }

  private removeLine(varName: string): void {
    const lines = this.readLines();
    const pattern = new RegExp(`^${varName}=`);
    this.writeLines(lines.filter((l) => !pattern.test(l)));
  }
}

/** Tên biến env duy nhất, đọc được từ mã thiết bị (RADIUS_SECRET_<CODE>_<4 hex ngẫu nhiên>). */
export function buildRadiusSecretVarName(deviceCode: string): string {
  const sanitized = deviceCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `RADIUS_SECRET_${sanitized || 'DEVICE'}_${suffix}`;
}
