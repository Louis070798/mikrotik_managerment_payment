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
  /** Han dung (epoch ms). Token khong co exp bi tu choi — xem verifyToken(). */
  exp: number;
}

/** Han token: 12 gio. Du cho mot ca truc, du ngan de mot token bi lo khong song mai. */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, secret: string): string {
  const now = Date.now();
  const full: TokenPayload = { ...payload, iat: now, exp: now + TOKEN_TTL_MS };
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
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    // Token cu (truoc khi co exp) va token het han deu bi tu choi. Chu ky dung van khong du:
    // khong co exp thi mot token bi lo se dung duoc vinh vien.
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
