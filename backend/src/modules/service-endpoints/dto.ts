import { z } from 'zod';

export const CreateEndpointSchema = z.object({
  service_type: z.enum([
    'RADIUS',
    'RADIUS_ACCT',
    'DATABASE',
    'COLLECTOR',
    'STORAGE',
    'USER_MANAGER',
    'CONTROLLER',
    'BUS',
    'CACHE',
    'ZEROTIER',
  ]),
  environment: z.string().min(1).default('development'),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  protocol: z.string().min(1),
  priority: z.number().int().min(1).max(1000).default(100),
  region: z.string().nullable().optional(),
  ship_scope: z.record(z.unknown()).default({ type: 'ALL' }),
  healthcheck_type: z.enum([
    'RADIUS_ACCESS_REQUEST',
    'RADIUS_ACCT_PROBE',
    'SQL_RW',
    'CLICKHOUSE_PING',
    'FLOW_RECENCY',
    'POLL_RECENCY',
    'S3_RW',
    'HTTP_FUNCTIONAL',
    'NATS_RTT',
    'BACKUP_FRESHNESS',
  ]),
  healthcheck_interval_s: z.number().int().positive().default(30),
  timeout_ms: z.number().int().positive().default(5000),
  // Tham chiếu (vd "env:RADIUS_TEST_SECRET"), KHÔNG BAO GIỜ giá trị secret thật — ADR-05.
  secret_ref: z.string().nullable().optional(),
  check_config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type CreateEndpointInput = z.infer<typeof CreateEndpointSchema>;

export const UpdateEndpointSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  protocol: z.string().min(1).optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  region: z.string().nullable().optional(),
  ship_scope: z.record(z.unknown()).optional(),
  healthcheck_type: z
    .enum([
      'RADIUS_ACCESS_REQUEST',
      'RADIUS_ACCT_PROBE',
      'SQL_RW',
      'CLICKHOUSE_PING',
      'FLOW_RECENCY',
      'POLL_RECENCY',
      'S3_RW',
      'HTTP_FUNCTIONAL',
      'NATS_RTT',
      'BACKUP_FRESHNESS',
    ])
    .optional(),
  healthcheck_interval_s: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().optional(),
  secret_ref: z.string().nullable().optional(),
  check_config: z.record(z.unknown()).optional(),
  // Bắt buộc — SYSTEM_SPEC §9.2: mọi thay đổi endpoint phải "có người yêu cầu" và đi vào audit.
  reason: z.string().min(3, 'reason is required for endpoint changes (goes into audit_logs)'),
});
export type UpdateEndpointInput = z.infer<typeof UpdateEndpointSchema>;

export const MaintenanceSchema = z.object({
  enable: z.boolean(),
  reason: z.string().min(3),
});
export type MaintenanceInput = z.infer<typeof MaintenanceSchema>;

export const ListEndpointsQuerySchema = z.object({
  service_name: z.string().optional(),
  environment: z.string().optional(),
  enabled: z.enum(['true', 'false']).optional(),
});
