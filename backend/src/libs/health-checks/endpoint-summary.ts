import { serviceEndpoints, serviceHealthState } from '@db/schema';

export type EndpointHealthRow = {
  service_endpoints: typeof serviceEndpoints.$inferSelect;
  service_health_state: typeof serviceHealthState.$inferSelect | null;
};

export type EndpointHealthSummary = {
  id: string;
  service_name: string;
  host: string;
  port: number;
  priority: number;
  status: string;
  is_active: boolean;
  last_check_at: string | null;
  last_success_at: string | null;
  rtt_ms: number | null;
  failure_count: number;
  breaker_state: string;
};

/** Shared by modules/health, modules/crew (radius-health) and modules/business (HA reporting). */
export function summarizeEndpointHealth(row: EndpointHealthRow): EndpointHealthSummary {
  const ep = row.service_endpoints;
  const hs = row.service_health_state;
  return {
    id: ep.id,
    service_name: ep.serviceName,
    host: ep.host,
    port: ep.port,
    priority: ep.priority,
    status: hs?.status ?? 'UNKNOWN',
    is_active: hs?.isActive ?? false,
    last_check_at: hs?.lastCheckAt?.toISOString() ?? null,
    last_success_at: hs?.lastSuccessAt?.toISOString() ?? null,
    rtt_ms: hs?.lastRttMs ?? null,
    failure_count: hs?.consecutiveFailures ?? 0,
    breaker_state: hs?.breakerState ?? 'CLOSED',
  };
}
