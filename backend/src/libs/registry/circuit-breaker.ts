export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold: number; // số lỗi liên tiếp để mở breaker
  cooldownMs: number; // thời gian ở OPEN trước khi cho phép 1 probe (HALF_OPEN)
}

export interface CircuitBreakerSnapshot {
  state: BreakerState;
  consecutiveFailures: number;
  openedAt: number | null;
}

/**
 * Circuit breaker per-endpoint, in-memory — ADR-04 (docs/backend/01-BACKEND_DESIGN.md).
 *
 * CLOSED      → cho phép gọi bình thường.
 * OPEN        → từ chối gọi (health sweep bỏ qua active probe) cho tới khi hết cooldown.
 * HALF_OPEN   → cho phép đúng MỘT probe thăm dò; thành công → CLOSED, thất bại → OPEN lại
 *               (cooldown reset).
 *
 * Instance-local: đủ đúng cho một process; multi-instance production cần chia sẻ trạng thái
 * qua Redis (đã ghi trong ADR-04) — ngoài phạm vi task này vì sandbox không có Redis/Docker.
 */
export class CircuitBreaker {
  private state: BreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private halfOpenProbeInFlight = false;

  constructor(private readonly options: CircuitBreakerOptions) {}

  snapshot(): CircuitBreakerSnapshot {
    return { state: this.state, consecutiveFailures: this.consecutiveFailures, openedAt: this.openedAt };
  }

  /** Có nên thực hiện một lần check chủ động ngay bây giờ không? */
  canProbe(now: number = Date.now()): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      const cooledDown = this.openedAt !== null && now - this.openedAt >= this.options.cooldownMs;
      if (cooledDown && !this.halfOpenProbeInFlight) {
        this.state = 'HALF_OPEN';
        this.halfOpenProbeInFlight = true;
        return true;
      }
      return false;
    }
    // HALF_OPEN: chỉ 1 probe được phép cùng lúc.
    return false;
  }

  onSuccess(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.halfOpenProbeInFlight = false;
  }

  onFailure(now: number = Date.now()): void {
    this.halfOpenProbeInFlight = false;
    this.consecutiveFailures += 1;
    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = now;
    }
  }

  /** Khôi phục breaker từ trạng thái đã lưu (khi service restart, đọc lại từ service_health_state). */
  static restore(
    options: CircuitBreakerOptions,
    saved: { state: BreakerState; consecutiveFailures: number; openedAt: number | null },
  ): CircuitBreaker {
    const cb = new CircuitBreaker(options);
    (cb as any).state = saved.state;
    (cb as any).consecutiveFailures = saved.consecutiveFailures;
    (cb as any).openedAt = saved.openedAt;
    return cb;
  }
}
