import { Injectable, Logger } from '@nestjs/common';
import { decryptReversible } from '@secrets/reversible-crypto';

/**
 * ==========================================================================
 * Ho tro 2 scheme cho secretRef (devices.credential_ref):
 *   - "enc:<iv_hex>:<tag_hex>:<ciphertext_hex>" -- RADIUS secret THAT do admin tu go, ma hoa
 *     AES-256-GCM (xem reversible-crypto.ts), giai ma bang RADIUS_SECRET_ENCRYPTION_KEY. Day la
 *     scheme THAT dung cho production, khong con la "TAM THOI" nua (thay cho EnvSecretStore
 *     tu sinh ngau nhien truoc day).
 *   - "env:TEN_BIEN" -- kieu cu, doc truc tiep bien moi truong. Giu lai de tuong thich nguoc voi
 *     credential_ref da cau hinh tay tu truoc (vd RADIUS_SECRET_HAINAM81), KHONG dung cho luong
 *     issueRadiusSecret() moi (da chuyen sang "enc:").
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

    if (secretRef.startsWith('enc:')) {
      const key = process.env.RADIUS_SECRET_ENCRYPTION_KEY;
      if (!key) {
        this.logger.warn('RADIUS_SECRET_ENCRYPTION_KEY chưa được cấu hình — không giải mã được credential_ref');
        return null;
      }
      try {
        return decryptReversible(secretRef.slice('enc:'.length), key);
      } catch (err) {
        this.logger.warn(`Giải mã credential_ref thất bại: ${(err as Error).message}`);
        return null;
      }
    }

    if (!secretRef.startsWith('env:')) {
      this.logger.warn(`Unsupported secret_ref scheme (expected "enc:*" or "env:*"): ${secretRef}`);
      return null;
    }
    const varName = secretRef.slice('env:'.length);
    return process.env[varName] ?? null;
  }
}
