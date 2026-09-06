import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const CreateAreaSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  timezone: z.string().min(1).default('UTC'),
  org_id: uuidSchema.nullable().optional(),
  geo: z.record(z.unknown()).nullable().optional(),
});
export type CreateAreaInput = z.infer<typeof CreateAreaSchema>;

export const UpdateAreaSchema = CreateAreaSchema.partial();
export type UpdateAreaInput = z.infer<typeof UpdateAreaSchema>;

export const CreateShipSchema = z.object({
  area_id: uuidSchema,
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  status: z.enum(['PLANNED', 'COMMISSIONING', 'ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).default('PLANNED'),
  timezone: z.string().min(1).default('UTC'),
  imo: z.string().nullable().optional(),
  mmsi: z.string().nullable().optional(),
  crew_capacity: z.number().int().positive().nullable().optional(),
  // Đại lý/công ty quản lý tàu này (tenants.id) — tuỳ chọn, không bắt buộc mọi tàu phải có.
  tenant_id: uuidSchema.nullable().optional(),
});
export type CreateShipInput = z.infer<typeof CreateShipSchema>;

export const UpdateShipSchema = CreateShipSchema.omit({ area_id: true }).partial();
export type UpdateShipInput = z.infer<typeof UpdateShipSchema>;

export const CreateDeviceSchema = z.object({
  ship_id: uuidSchema,
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  role: z.enum(['EDGE', 'CORE', 'SWITCH', 'AP', 'CPE']),
  model: z.string().nullable().optional(),
  serial: z.string().nullable().optional(),
  architecture: z.string().nullable().optional(),
  routeros_version: z.string().nullable().optional(),
  api_transport: z.enum(['REST', 'API_SSL', 'API']).default('REST'),
  // Tham chiếu, KHÔNG BAO GIỜ giá trị credential thật (ADR-05) — validate định dạng, không validate nội dung.
  credential_ref: z.string().nullable().optional(),
  mgmt_endpoint_ref: z.string().nullable().optional(),
  poll_interval_s: z.number().int().positive().default(60),
  // Inventory thật, KHÔNG phải secret — IP quản trị của router (khác credential_ref/mgmt_endpoint_ref).
  ip_address: z.string().nullable().optional(),
  // Nguyên văn RouterOS config (vd /export hide-sensitive) để tham khảo — server KHÔNG BAO GIỜ tự
  // thực thi hay đẩy xuống router; chỉ lưu để hiển thị/tham chiếu trên giao diện.
  router_config_text: z.string().nullable().optional(),
});
export type CreateDeviceInput = z.infer<typeof CreateDeviceSchema>;

export const UpdateDeviceSchema = CreateDeviceSchema.omit({ ship_id: true })
  .partial()
  .extend({
    status: z.enum(['UNKNOWN', 'ONLINE', 'DEGRADED', 'OFFLINE', 'MAINTENANCE']).optional(),
  });
export type UpdateDeviceInput = z.infer<typeof UpdateDeviceSchema>;

// Body that MikroTik tu gui khi push telemetry moi 5 phut (POST /devices/{id}/telemetry-push).
export const DeviceTelemetryPushSchema = z.object({
  identity: z.string().nullable().optional(),
  ip_address: z.string().nullable().optional(),
  interfaces: z
    .array(
      z.object({
        name: z.string().min(1),
        rx_byte: z.number().nonnegative(),
        tx_byte: z.number().nonnegative(),
        rx_packet: z.number().nonnegative().nullable().optional(),
        tx_packet: z.number().nonnegative().nullable().optional(),
        rx_error: z.number().nonnegative().nullable().optional(),
        tx_error: z.number().nonnegative().nullable().optional(),
      }),
    )
    .min(1),
});
export type DeviceTelemetryPushInput = z.infer<typeof DeviceTelemetryPushSchema>;

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().nullable().optional(),
});

export const ListShipsQuerySchema = ListQuerySchema.extend({
  area_id: uuidSchema.optional(),
  status: z.enum(['PLANNED', 'COMMISSIONING', 'ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']).optional(),
  q: z.string().optional(),
});

export const ListDevicesQuerySchema = ListQuerySchema.extend({
  ship_id: uuidSchema.optional(),
  role: z.enum(['EDGE', 'CORE', 'SWITCH', 'AP', 'CPE']).optional(),
  status: z.enum(['UNKNOWN', 'ONLINE', 'DEGRADED', 'OFFLINE', 'MAINTENANCE']).optional(),
});
