import { z } from 'zod';

const rfc3339 = z.string().datetime({ offset: true });
const nonNegativeInteger = z.number().int().nonnegative();
const nonNegativeCounter = z.union([nonNegativeInteger, z.string().regex(/^\d+$/, 'must be a non-negative integer')]);

export const TelemetrySourceSchema = z.enum(['INTERFACE_COUNTER', 'RADIUS_ACCOUNTING', 'IPFIX_FLOW']);
export type TelemetrySource = z.infer<typeof TelemetrySourceSchema>;

export const TelemetryIdentitySchema = z.object({
  ship_id: z.string().uuid().optional(),
  device_id: z.string().uuid().optional(),
  interface_id: z.string().uuid().optional(),
  user_identity: z.string().min(1).max(255).optional(),
  user_identity_type: z.enum(['USERNAME', 'IP', 'MAC', 'SESSION_ID', 'UNKNOWN']).optional(),
  source_device_ref: z.string().min(1).max(255).optional(),
  source_interface_ref: z.string().min(1).max(255).optional(),
});

const TelemetryEventBaseSchema = z.object({
  source: TelemetrySourceSchema,
  idempotency_key: z.string().min(1).max(255),
  source_event_id: z.string().min(1).max(255).optional(),
  observed_at: rfc3339,
  identity: TelemetryIdentitySchema.default({}),
  payload: z.record(z.unknown()).optional(),
  raw_reference: z.string().min(1).max(2048).optional(),
  metadata: z.record(z.unknown()).default({}),
});

function requirePayloadField(
  payload: Record<string, unknown> | undefined,
  key: string,
  valid: (value: unknown) => boolean,
  ctx: z.RefinementCtx,
) {
  if (payload === undefined || !valid(payload[key])) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payload', key], message: `${key} is required for this source` });
  }
}

export const TelemetryEventSchema = TelemetryEventBaseSchema.superRefine((event, ctx) => {
  if (!event.payload && !event.raw_reference) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payload'], message: 'payload or raw_reference is required' });
  }
  if (!event.payload) return;

  if (event.source === 'INTERFACE_COUNTER') {
    requirePayloadField(event.payload, 'interface_name', (value) => typeof value === 'string' && value.length > 0, ctx);
    requirePayloadField(event.payload, 'rx_bytes', (value) => nonNegativeCounter.safeParse(value).success, ctx);
    requirePayloadField(event.payload, 'tx_bytes', (value) => nonNegativeCounter.safeParse(value).success, ctx);
  }
  if (event.source === 'RADIUS_ACCOUNTING') {
    requirePayloadField(event.payload, 'acct_status_type', (value) => ['START', 'INTERIM_UPDATE', 'STOP', 'ON'].includes(String(value)), ctx);
    requirePayloadField(event.payload, 'acct_session_id', (value) => typeof value === 'string' && value.length > 0, ctx);
  }
  if (event.source === 'IPFIX_FLOW') {
    requirePayloadField(event.payload, 'bytes', (value) => nonNegativeCounter.safeParse(value).success, ctx);
  }
});

export const TelemetryIngestRequestSchema = z.object({
  events: z.array(TelemetryEventSchema).min(1).max(500),
});

export type TelemetryEventInput = z.infer<typeof TelemetryEventSchema>;
export type TelemetryIngestRequest = z.infer<typeof TelemetryIngestRequestSchema>;
