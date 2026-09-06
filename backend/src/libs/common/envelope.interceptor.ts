import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { getRequestContext } from './request-context';

export interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
  error: null;
}

/**
 * Bọc mọi response thành công vào envelope {data, meta, error} — AGENT_COLLABORATION §5.
 * Handler trả về { data, meta? } thô; interceptor thêm request_id/generated_at.
 * Nếu handler đã trả đúng shape {data, meta, error:null} thì giữ nguyên các meta đã set.
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<Envelope<unknown>> {
    return next.handle().pipe(
      map((result) => {
        const { requestId } = getRequestContext();
        const isEnvelopeShaped =
          result && typeof result === 'object' && 'data' in result && 'meta' in result;
        const data = isEnvelopeShaped ? (result as any).data : result;
        const extraMeta = isEnvelopeShaped ? (result as any).meta : {};
        return {
          data: data ?? null,
          meta: {
            request_id: requestId,
            generated_at: new Date().toISOString(),
            ...extraMeta,
          },
          error: null,
        };
      }),
    );
  }
}
