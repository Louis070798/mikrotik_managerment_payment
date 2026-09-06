import { Injectable, Logger } from '@nestjs/common';

/**
 * ==========================================================================
 * TẠM THỜI cho tới khi module Secrets (ADR-05, SecretProvider + envelope encryption)
 * được implement. Interface này được thiết kế để về sau chỉ cần đổi implementation,
 * không đổi call site trong các HealthChecker.
 *
 * Hiện tại: đọc secret từ biến môi trường theo dạng `secretRef = "env:TEN_BIEN"`.
 * KHÔNG dùng cho production — chỉ hợp lệ trong dev/test vì các biến này chỉ trỏ tới
 * RADIUS/DB giả lập trong sandbox, không phải hệ thống thật.
 * ==========================================================================
 */
export interface CredentialResolver {
  resolve(secretRef: string | null): Promise<string | null>;
}

@Injectable()
export class EnvCredentialResolver implements CredentialResolver {
  private readonly logger = new Logger(EnvCredentialResolver.name);

  async resolve(secretRef: string | null): Promise<string | null> {
    if (!secretRef) return null;
    if (!secretRef.startsWith('env:')) {
      this.logger.warn(`Unsupported secret_ref scheme (expected "env:*" in this dev resolver): ${secretRef}`);
      return null;
    }
    const varName = secretRef.slice('env:'.length);
    return process.env[varName] ?? null;
  }
}
