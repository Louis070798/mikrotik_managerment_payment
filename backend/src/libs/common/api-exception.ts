import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG, ErrorCode } from './errors';

/**
 * Exception mang đúng hình dạng ApiError của envelope (docs/backend/03-API_DESIGN.md §1.2).
 * Mọi lỗi nghiệp vụ trong modules/* nên throw exception này thay vì HttpException thô,
 * để exception filter luôn trả được envelope {data:null, meta, error} nhất quán.
 */
export class ApiException extends HttpException {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    const entry = ERROR_CATALOG[code];
    super({ code, message, details }, entry.httpStatus);
    this.code = code;
    this.details = details;
  }
}
