import { z } from 'zod';

/**
 * Tier 0 bootstrap config — ADR-04 (docs/backend/01-BACKEND_DESIGN.md).
 * Đây là danh sách RẤT NGẮN và ĐÓNG BĂNG. Không thêm biến env mới cho một service cụ thể
 * (radius, collector, database.analytics...) — những thứ đó đi qua bảng `service_endpoints`
 * và được đọc qua ServiceRegistry, không qua process.env.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NODE_ROLE: z.enum(['api', 'worker', 'scheduler']).default('api'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_CONTROL_URL: z.string().min(1, 'DATABASE_CONTROL_URL is required'),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),

  // Port UDP server tự lắng nghe (RADIUS Accounting, RFC 2866) — giống PORT ở trên, đây là bind
  // port của CHÍNH backend, không phải địa chỉ 1 service ngoài nên không vi phạm ADR-04.
  RADIUS_ACCT_PORT: z.coerce.number().int().positive().default(1813),
  // Access-Request (đăng nhập PAP thật) — cổng chuẩn RADIUS 1812, tách khỏi accounting vì
  // RouterOS "RADIUS Client" cấu hình 2 cổng riêng (auth-port/acct-port) theo mặc định.
  RADIUS_AUTH_PORT: z.coerce.number().int().positive().default(1812),
  // NetFlow v9 collector (bind port của chính backend, giống PORT/RADIUS_ACCT_PORT ở trên).
  NETFLOW_PORT: z.coerce.number().int().positive().default(2055),
  // DNS syslog collector (bind port của chính backend).
  DNS_LOG_PORT: z.coerce.number().int().positive().default(5514),

  // Health-check tuning — không phải địa chỉ service, chỉ là tham số vận hành chung.
  HEALTH_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(30000),
  HEALTH_CHECK_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
