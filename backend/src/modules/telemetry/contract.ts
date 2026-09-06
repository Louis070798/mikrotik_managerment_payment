import { createHash } from 'node:crypto';
import { TelemetrySource } from './dto';

export const TELEMETRY_SOURCES: TelemetrySource[] = ['INTERFACE_COUNTER', 'RADIUS_ACCOUNTING', 'IPFIX_FLOW'];
export const TELEMETRY_STALE_AFTER_SECONDS = 300;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

export function hashTelemetryPayload(payload: Record<string, unknown> | undefined, rawReference: string | undefined, context?: unknown): string {
  return createHash('sha256')
    .update(`${canonicalJson(context ?? null)}|${canonicalJson(payload ?? null)}|${rawReference ?? ''}`, 'utf8')
    .digest('hex');
}

export type TelemetrySourceHealth = {
  source: TelemetrySource;
  status: 'HEALTHY' | 'DEGRADED' | 'UNKNOWN';
  event_count: number;
  last_received_at: string | null;
  freshness_seconds: number | null;
};

export function sourceHealth(source: TelemetrySource, eventCount: number, lastReceivedAt: Date | null, now = new Date()): TelemetrySourceHealth {
  const freshness = lastReceivedAt ? Math.max(0, Math.floor((now.getTime() - lastReceivedAt.getTime()) / 1000)) : null;
  return {
    source,
    status: eventCount === 0 ? 'UNKNOWN' : freshness !== null && freshness > TELEMETRY_STALE_AFTER_SECONDS ? 'DEGRADED' : 'HEALTHY',
    event_count: eventCount,
    last_received_at: lastReceivedAt?.toISOString() ?? null,
    freshness_seconds: freshness,
  };
}
