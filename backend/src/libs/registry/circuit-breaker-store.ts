import { Injectable } from '@nestjs/common';
import { CircuitBreaker, CircuitBreakerOptions } from './circuit-breaker';

/**
 * Giữ một CircuitBreaker instance cho mỗi endpoint_id trong bộ nhớ tiến trình.
 * Trạng thái cũng được ghi xuống service_health_state (nguồn quan sát được cho API/dashboard);
 * store này là bản làm việc nhanh dùng để quyết định "có nên probe bây giờ không".
 */
@Injectable()
export class CircuitBreakerStore {
  private breakers = new Map<string, CircuitBreaker>();

  get(endpointId: string, options: CircuitBreakerOptions): CircuitBreaker {
    let cb = this.breakers.get(endpointId);
    if (!cb) {
      cb = new CircuitBreaker(options);
      this.breakers.set(endpointId, cb);
    }
    return cb;
  }

  delete(endpointId: string): void {
    this.breakers.delete(endpointId);
  }

  reset(): void {
    this.breakers.clear();
  }
}
