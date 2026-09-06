import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { getRequestContext } from './request-context';
import { ApiException } from './api-exception';

/**
 * Map MỌI exception thành envelope lỗi {data:null, meta, error}. Không bao giờ để lộ
 * stack trace, database exception hay driver error string ra response — AGENT_COLLABORATION §11.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const { requestId } = getRequestContext();

    let httpStatus = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: Record<string, unknown> | undefined;
    let retryable = true;
    let retryAfterSeconds: number | undefined = 5;

    if (exception instanceof ApiException) {
      httpStatus = exception.getStatus();
      const body = exception.getResponse() as any;
      code = body.code;
      message = body.message;
      details = body.details;
      const { ERROR_CATALOG } = require('./errors');
      retryable = ERROR_CATALOG[code]?.retryable ?? false;
      retryAfterSeconds = ERROR_CATALOG[code]?.retryAfterSeconds;
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const body = exception.getResponse();
      code = httpStatus === 400 ? 'VALIDATION_FAILED' : httpStatus === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
      message = typeof body === 'string' ? body : (body as any)?.message || exception.message;
      retryable = httpStatus >= 500;
      retryAfterSeconds = retryable ? 5 : undefined;
    } else {
      // Lỗi không lường trước (driver, runtime...) — log đầy đủ ở server, KHÔNG trả chi tiết ra client.
      this.logger.error(
        `Unhandled exception [${requestId}]: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    res.status?.(httpStatus).send({
      data: null,
      meta: { request_id: requestId },
      error: { code, message, details, retryable, retry_after_seconds: retryAfterSeconds },
    });
  }
}
