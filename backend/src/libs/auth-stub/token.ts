import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token that toi thieu (HMAC-SHA256 tu ky, khong dung JWT lib ngoai — cung chu truong chi dung
 * `crypto` builtin nhu password-hash.ts/env-secret-store.ts). KHONG phai chuan JWT (khong header
 * rieng, khong alg negotiation) — chi du de AuthStubGuard/AuthController phan biet duoc ai THAT
 * SU dang nhap (tenant that) voi luong fallback admin cu, khong bi gia mao vi co chu ky.
 */
export interface TokenPayload {
  sub: string;
  role: 'admin' | 'tenant';
  name: string;
  tenant_id?: string;
  iat: number;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

export function signToken(payload: Omit<TokenPayload, 'iat'>, secret: string): string {
  const full: TokenPayload = { ...payload, iat: Date.now() };
  const body = base64url(JSON.stringify(full));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = createHmac('sha256', secret).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    return null;
  }
}
