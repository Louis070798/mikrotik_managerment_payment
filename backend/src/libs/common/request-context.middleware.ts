import { Injectable, NestMiddleware } from '@nestjs/common';
import { ulid } from 'ulid';
import { requestContextStorage } from './request-context';

/**
 * Sinh request_id cho MỌI request (đối chiếu được với audit_logs — AGENT_COLLABORATION §5),
 * và đọc actor từ header dev-stub (xem libs/auth-stub — auth module đầy đủ chưa nằm trong
 * phạm vi task này, đây là chỗ cắm JWT guard thật sau này mà không đổi call site).
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const requestId = `req_${ulid()}`;
    const actorLabel = (req.headers['x-actor-label'] as string) || 'anonymous';
    const actorId = (req.headers['x-actor-id'] as string) || null;
    res.header?.('x-request-id', requestId);
    requestContextStorage.run(
      {
        requestId,
        actorId,
        actorLabel,
        actorType: 'USER',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
      () => next(),
    );
  }
}
