import { Injectable, NestMiddleware } from '@nestjs/common';
import { ulid } from 'ulid';
import { EnvSecretStore } from '@secrets/env-secret-store';
import { verifyToken } from '@auth-stub/token';
import { requestContextStorage } from './request-context';

/**
 * Sinh request_id cho MỌI request (đối chiếu được với audit_logs — AGENT_COLLABORATION §5),
 * và xác định actor TỪ TOKEN ĐÃ KÝ.
 *
 * Bản trước lấy actor từ `x-actor-label` / `x-actor-id` — hai header do chính client đặt. Nghĩa là
 * mọi dòng trong audit_logs đều giả được: ai cũng có thể ghi một hành động dưới tên người khác.
 * Với một bảng sinh ra để truy trách nhiệm thì đó là lỗi nghiêm trọng hơn cả việc thiếu log.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly envStore: EnvSecretStore) {}

  use(req: any, res: any, next: () => void) {
    const requestId = `req_${ulid()}`;
    // Middleware chay TRUOC guard nen khong doc duoc req.actor — tu verify lai o day. Chi la mot
    // phep HMAC, re hon nhieu so voi cai gia phai tra khi audit log ghi sai nguoi.
    const raw = (req.headers['authorization'] as string) || '';
    const token = raw.startsWith('Bearer ') ? raw.slice('Bearer '.length).trim() : '';
    const secret = this.envStore.get('AUTH_TOKEN_SECRET');
    const payload = token && secret ? verifyToken(token, secret) : null;
    const actorLabel = payload?.name ?? 'anonymous';
    const actorId = payload?.sub ?? null;
    res.header?.('x-request-id', requestId);
    requestContextStorage.run(
      {
        requestId,
        actorId,
        actorLabel,
        actorType: 'USER',
        actorRole: payload?.role ?? null,
        actorTenantId: payload?.role === 'tenant' ? payload.tenant_id ?? null : null,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      () => next(),
    );
  }
}
