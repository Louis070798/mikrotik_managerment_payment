import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Ma hoa 2 chieu (AES-256-GCM) cho cac secret CAN gia tri that de dung lai (vd RADIUS shared
 * secret -- server phai tinh lai Request-Authenticator/HMAC voi dung gia tri secret, khong the
 * chi so sanh ban bam 1 chieu nhu mat khau dang nhap). Khac han password-hash/ (scrypt, 1 chieu,
 * dung cho tenant/subscriber login).
 *
 * Dinh dang luu: "<iv_hex>:<authTag_hex>:<ciphertext_hex>" -- tu chua du thong tin de giai ma lai,
 * khong can cot rieng cho iv/tag.
 *
 * Key ma hoa lay tu bien moi truong RADIUS_SECRET_ENCRYPTION_KEY (64 ky tu hex = 32 byte, xem
 * env.schema.ts) -- KHONG hard-code, KHONG luu trong DB cung voi ciphertext.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

export function encryptReversible(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptReversible(stored: string, keyHex: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid reversible-encrypted value format (expected iv:tag:ciphertext)');
  const [ivHex, tagHex, dataHex] = parts;
  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
