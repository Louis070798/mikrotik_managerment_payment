// Nạp .env.test vào process.env cho toàn bộ test run (ts-jest chạy trong process Node
// thường, không tự đọc .env như Nest CLI) — trỏ DATABASE_CONTROL_URL sang fleet_control_test,
// KHÔNG BAO GIỜ chạy test nhắm vào fleet_control_dev.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(join(__dirname, '..', '.env.test'));

// Keep unit/contract tests deterministic even when .env.test has not been created yet.
// Integration tests still require PostgreSQL; this default only exposes the real connection error.
process.env.DATABASE_CONTROL_URL =
  process.env.DATABASE_CONTROL_URL ?? 'postgres://fleet_app:fleet_dev_local_only@127.0.0.1:54329/fleet_control_test';

// Secret giả cho các health-checker test — chỉ trỏ tới RADIUS/DB giả lập trong sandbox test,
// KHÔNG PHẢI secret thật (env resolver đọc trực tiếp từ process.env, xem credential-resolver.ts).
process.env.RADIUS_TEST_SECRET = process.env.RADIUS_TEST_SECRET ?? 'test-radius-shared-secret';
process.env.DB_TEST_PASSWORD = process.env.DB_TEST_PASSWORD ?? 'fleet_dev_local_only';

// Sweep loop tự động bị tắt khi NODE_ENV=test trong HealthSweepService.onModuleInit() —
// test tự gọi sweepEndpointById()/triggerCheck() một cách tường minh.
process.env.NODE_ENV = 'test';
