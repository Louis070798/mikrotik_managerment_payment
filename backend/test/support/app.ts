import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { buildApp } from '../../src/apps/api/main';

/**
 * Test helper dùng chung cho integration + contract test — build một Nest app THẬT
 * (không mock DB/Registry) trỏ vào fleet_control_test (test/jest.setup.ts đã nạp
 * DATABASE_CONTROL_URL trỏ tới DB test), dùng app.inject() của Fastify để gọi HTTP
 * mà không cần bind cổng TCP thật.
 */
export async function buildTestApp(): Promise<NestFastifyApplication> {
  const app = await buildApp();
  app.useLogger(false); // im lặng log Nest trong test — output test đã đủ dài
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

const TABLES_IN_DELETE_ORDER = [
  'identity_bindings',
  'ipfix_flow_records',
  'radius_sessions',
  'radius_accounting_events',
  'interface_counter_deltas',
  'interface_counter_samples',
  'raw_telemetry_events',
  'alerts',
  'audit_logs',
  'service_endpoint_revisions',
  'service_health_state',
  'service_endpoints',
  'device_backups',
  'interfaces',
  'network_zones',
  'devices',
  'ships',
  'areas',
  'organizations',
];

/** Xoá sạch dữ liệu nghiệp vụ giữa các test file — GIỮ NGUYÊN schema_migrations. */
export async function resetTestDb(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE TABLE ${TABLES_IN_DELETE_ORDER.join(', ')} RESTART IDENTITY CASCADE`);
}

export function authHeader(...permissions: string[]) {
  return { 'x-actor-permissions': permissions.join(',') };
}

export function newPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_CONTROL_URL });
}

export type TestDbTarget = { host: string; port: number; username: string; database: string };

/**
 * Toạ độ THẬT của Postgres test, đọc từ DATABASE_CONTROL_URL.
 *
 * Không được hard-code 127.0.0.1:5432 trong test: infra/docker-compose.test.yml map container
 * ra cổng 54329 (mặc định, đổi được qua POSTGRES_PORT). Hard-code 5432 khiến health check
 * SQL_RW trỏ vào một Postgres khác — trên máy dev có sẵn Postgres thì test "xanh" vì nhầm
 * server, trên CI sạch thì đỏ. Đây cũng chính là nguyên tắc #5 "địa chỉ đến từ cấu hình,
 * không nằm trong code".
 */
export function testDbTarget(): TestDbTarget {
  const raw = process.env.DATABASE_CONTROL_URL;
  if (!raw) throw new Error('DATABASE_CONTROL_URL is required for integration tests (see backend/.env.test.example)');
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    username: decodeURIComponent(url.username) || 'fleet_app',
    database: url.pathname.replace(/^\//, '') || 'fleet_control_test',
  };
}
