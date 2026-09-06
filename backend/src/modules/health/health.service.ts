import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { serviceEndpoints, serviceHealthState } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { summarizeEndpointHealth } from '@health-checks/endpoint-summary';

function endpointSummary(row: { service_endpoints: typeof serviceEndpoints.$inferSelect; service_health_state: typeof serviceHealthState.$inferSelect | null }) {
  const ep = row.service_endpoints;
  const hs = row.service_health_state;
  return {
    id: ep.id,
    label: `${ep.host}:${ep.port}`,
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
    last_error: hs?.lastError ?? null,
    check: { type: ep.healthcheckType },
  };
}

/**
 * SYSTEM_SPEC §10.4 Dashboard Server Health. Trạng thái tổng hợp của MỘT service
 * (nhiều endpoint) được tính theo quy tắc "xấu nhất thắng, nhưng còn active thì không
 * UNHEALTHY toàn cục": nếu có ít nhất một endpoint HEALTHY/DEGRADED đang active thì
 * service đó DEGRADED (đã failover) chứ không phải UNHEALTHY; chỉ UNHEALTHY khi
 * KHÔNG còn endpoint nào phục vụ được.
 */
function summarizeServiceStatus(endpoints: ReturnType<typeof endpointSummary>[]): string {
  if (endpoints.length === 0) return 'UNKNOWN';
  if (endpoints.every((e) => e.status === 'MAINTENANCE')) return 'MAINTENANCE';
  const healthyCount = endpoints.filter((e) => e.status === 'HEALTHY').length;
  const degradedOrHealthyCount = endpoints.filter((e) => e.status === 'HEALTHY' || e.status === 'DEGRADED').length;
  if (healthyCount === endpoints.length) return 'HEALTHY';
  if (degradedOrHealthyCount > 0) return 'DEGRADED';
  if (endpoints.some((e) => e.status === 'UNKNOWN')) return 'UNKNOWN';
  return 'UNHEALTHY';
}

@Injectable()
export class HealthService {
  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  async summary() {
    const rows = await this.db
      .select()
      .from(serviceEndpoints)
      .leftJoin(serviceHealthState, eq(serviceHealthState.endpointId, serviceEndpoints.id))
      .where(isNull(serviceEndpoints.deletedAt));

    const byService = new Map<string, { serviceType: string; endpoints: ReturnType<typeof endpointSummary>[] }>();
    for (const row of rows) {
      const name = row.service_endpoints.serviceName;
      if (!byService.has(name)) byService.set(name, { serviceType: row.service_endpoints.serviceType, endpoints: [] });
      byService.get(name)!.endpoints.push(endpointSummary(row));
    }

    const services = [...byService.entries()].map(([serviceName, v]) => ({
      service_name: serviceName,
      service_type: v.serviceType,
      status: summarizeServiceStatus(v.endpoints),
      healthy_endpoints: v.endpoints.filter((e) => e.status === 'HEALTHY').length,
      total_endpoints: v.endpoints.length,
      active_endpoint: v.endpoints.find((e) => e.is_active) ?? null,
    }));

    const overall = services.some((s) => s.status === 'UNHEALTHY')
      ? 'UNHEALTHY'
      : services.some((s) => s.status === 'DEGRADED')
        ? 'DEGRADED'
        : services.every((s) => s.status === 'HEALTHY' || s.status === 'MAINTENANCE')
          ? 'HEALTHY'
          : 'UNKNOWN';

    return { overall, services };
  }

  async listServices() {
    const rows = await this.db
      .select()
      .from(serviceEndpoints)
      .leftJoin(serviceHealthState, eq(serviceHealthState.endpointId, serviceEndpoints.id))
      .where(isNull(serviceEndpoints.deletedAt));

    const byService = new Map<string, { serviceType: string; endpoints: ReturnType<typeof endpointSummary>[] }>();
    for (const row of rows) {
      const name = row.service_endpoints.serviceName;
      if (!byService.has(name)) byService.set(name, { serviceType: row.service_endpoints.serviceType, endpoints: [] });
      byService.get(name)!.endpoints.push(endpointSummary(row));
    }

    return [...byService.entries()].map(([serviceName, v]) => ({
      service_name: serviceName,
      service_type: v.serviceType,
      status: summarizeServiceStatus(v.endpoints),
      healthy_endpoints: v.endpoints.filter((e) => e.status === 'HEALTHY').length,
      total_endpoints: v.endpoints.length,
      active_endpoint: v.endpoints.find((e) => e.is_active) ?? null,
    }));
  }

  async getService(serviceName: string) {
    const rows = await this.db
      .select()
      .from(serviceEndpoints)
      .leftJoin(serviceHealthState, eq(serviceHealthState.endpointId, serviceEndpoints.id))
      .where(and(eq(serviceEndpoints.serviceName, serviceName), isNull(serviceEndpoints.deletedAt)));

    if (rows.length === 0) throw new ApiException('SERVICE_NOT_FOUND', `Service "${serviceName}" not found`);

    const endpoints = rows.map(endpointSummary);
    return {
      service_name: serviceName,
      service_type: rows[0].service_endpoints.serviceType,
      status: summarizeServiceStatus(endpoints),
      healthy_endpoints: endpoints.filter((e) => e.status === 'HEALTHY').length,
      total_endpoints: endpoints.length,
      active_endpoint: endpoints.find((e) => e.is_active) ?? null,
      endpoints,
    };
  }

  /**
   * Goal #5 — fleet-wide HA compliance: min 2 RADIUS, min 2 database, collector presence, raw
   * storage presence, backup storage A/B (two distinct storage.backup.* service_names),
   * primary/secondary state, replication lag, failover state. Every address comes from
   * service_endpoints (ADR-04) — nothing here is hard-coded.
   */
  async getHaSummary() {
    const rows = await this.db
      .select()
      .from(serviceEndpoints)
      .leftJoin(serviceHealthState, eq(serviceHealthState.endpointId, serviceEndpoints.id))
      .where(and(eq(serviceEndpoints.enabled, true), isNull(serviceEndpoints.deletedAt)))
      .orderBy(asc(serviceEndpoints.priority));

    const byServiceName = new Map<string, typeof rows>();
    for (const row of rows) {
      const name = row.service_endpoints.serviceName;
      if (!byServiceName.has(name)) byServiceName.set(name, []);
      byServiceName.get(name)!.push(row);
    }

    const databaseGroups = [];
    const radiusGroups = [];
    const collectorGroups = [];
    const rawStorageGroups = [];
    const backupServiceNames = new Set<string>();

    for (const [serviceName, groupRows] of byServiceName) {
      const serviceType = groupRows[0].service_endpoints.serviceType;
      const endpoints = groupRows.map((r) => ({
        ...summarizeEndpointHealth(r),
        details: (r.service_health_state?.details as Record<string, unknown> | null) ?? null,
      }));
      const activeEndpoint = endpoints.find((e) => e.is_active) ?? null;
      const primaryByPriority = [...groupRows].sort((a, b) => a.service_endpoints.priority - b.service_endpoints.priority)[0];
      const failoverState = !activeEndpoint ? 'DOWN' : activeEndpoint.id === primaryByPriority.service_endpoints.id ? 'NORMAL' : 'FAILED_OVER';

      const group = {
        service_name: serviceName,
        configured_endpoints: endpoints.length,
        healthy_endpoints: endpoints.filter((e) => e.status === 'HEALTHY' || e.status === 'DEGRADED').length,
        primary_endpoint_id: primaryByPriority.service_endpoints.id,
        active_endpoint_id: activeEndpoint?.id ?? null,
        failover_state: failoverState,
        endpoints,
      };

      if (serviceType === 'DATABASE') databaseGroups.push(group);
      else if (serviceType === 'RADIUS' || serviceType === 'RADIUS_ACCT') radiusGroups.push(group);
      else if (serviceType === 'COLLECTOR') collectorGroups.push(group);
      else if (serviceType === 'STORAGE') {
        if (serviceName.startsWith('storage.raw')) rawStorageGroups.push(group);
        else if (serviceName.startsWith('storage.backup')) backupServiceNames.add(serviceName);
      }
    }

    const radiusEndpointCount = radiusGroups.reduce((sum, g) => sum + g.configured_endpoints, 0);
    const databaseEndpointCount = databaseGroups.reduce((sum, g) => sum + g.configured_endpoints, 0);

    return {
      radius: { min_required: 2, configured_endpoints: radiusEndpointCount, compliant: radiusEndpointCount >= 2, groups: radiusGroups },
      database: { min_required: 2, configured_endpoints: databaseEndpointCount, compliant: databaseEndpointCount >= 2, groups: databaseGroups },
      collector: { configured_endpoints: collectorGroups.reduce((s, g) => s + g.configured_endpoints, 0), groups: collectorGroups },
      raw_storage: { configured_endpoints: rawStorageGroups.reduce((s, g) => s + g.configured_endpoints, 0), groups: rawStorageGroups },
      backup_storage: {
        min_required_targets: 2,
        configured_targets: backupServiceNames.size,
        compliant: backupServiceNames.size >= 2,
        groups: [...backupServiceNames].map((name) => byServiceName.get(name)!.map((r) => summarizeEndpointHealth(r))).flat(),
      },
    };
  }
}
