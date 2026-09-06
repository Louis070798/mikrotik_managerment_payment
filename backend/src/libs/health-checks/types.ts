export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN' | 'MAINTENANCE';

/**
 * Kết quả MỘT lần thử của checker — chưa phải status cuối cùng. Runner (health-sweep)
 * áp dụng retry + circuit breaker lên trên để suy ra status cuối, vì retry/breaker là
 * mối quan tâm chung cho mọi loại service, không nên lặp lại trong từng checker.
 */
export interface CheckAttemptResult {
  success: boolean;
  degraded?: boolean; // true = trả lời được nhưng có dấu hiệu suy giảm (vd RTT cao, backup quá hạn)
  rttMs?: number;
  details?: Record<string, unknown>;
  errorMessage?: string;
}

export interface HealthChecker {
  readonly healthcheckType: string;
  check(endpoint: import('@registry/registry.types').EndpointCandidate): Promise<CheckAttemptResult>;
}
