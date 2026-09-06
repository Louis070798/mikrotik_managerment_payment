export interface RetryOptions {
  maxAttempts: number; // tổng số lần thử, bao gồm lần đầu
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  timeoutMs: 5000,
};

export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function jitteredBackoff(attempt: number, base: number, max: number): number {
  const exp = Math.min(max, base * 2 ** (attempt - 1));
  return Math.floor(exp * (0.5 + Math.random() * 0.5)); // +/- jitter, tránh thundering herd
}

export interface RetryAttemptLog {
  attempt: number;
  error: string;
  delayMs: number;
}

export interface RetryResult<T> {
  ok: boolean;
  value?: T;
  error?: Error;
  attempts: number;
  attemptLog: RetryAttemptLog[];
  totalDurationMs: number;
}

/**
 * Thực thi `fn` với retry + timeout mỗi lần thử + exponential backoff có jitter.
 * KHÔNG throw — trả về RetryResult để caller (health checker) tự quyết định status,
 * vì "thất bại sau khi retry" là một kết quả hợp lệ cần được ghi lại, không phải exception.
 */
export async function retryWithTimeout<T>(
  fn: (attempt: number) => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const attemptLog: RetryAttemptLog[] = [];
  const start = Date.now();

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const value = await withTimeout(fn(attempt), opts.timeoutMs);
      return { ok: true, value, attempts: attempt, attemptLog, totalDurationMs: Date.now() - start };
    } catch (err) {
      const isLast = attempt === opts.maxAttempts;
      const delayMs = isLast ? 0 : jitteredBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs);
      attemptLog.push({ attempt, error: (err as Error).message, delayMs });
      if (isLast) {
        return { ok: false, error: err as Error, attempts: attempt, attemptLog, totalDurationMs: Date.now() - start };
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Không bao giờ tới đây (maxAttempts >= 1 luôn return trong loop), giữ để TypeScript hài lòng.
  throw new Error('unreachable');
}
