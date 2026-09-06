import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, desc, eq, isNull, SQL } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { serviceEndpoints, serviceEndpointRevisions, serviceHealthState } from '@db/schema';
import { ApiException } from '@common/api-exception';
import { AuditService } from '@audit/audit.service';
import { getRequestContext } from '@common/request-context';
import { ENDPOINT_CHANGED_EVENT } from '@registry/registry.types';
import { HealthSweepService } from '@health-checks/health-sweep.service';
import { CreateEndpointInput, MaintenanceInput, UpdateEndpointInput } from './dto';

function toApi(row: typeof serviceEndpoints.$inferSelect, health?: typeof serviceHealthState.$inferSelect | null) {
  return {
    id: row.id,
    service_name: row.serviceName,
    service_type: row.serviceType,
    environment: row.environment,
    host: row.host,
    port: row.port,
    protocol: row.protocol,
    priority: row.priority,
    enabled: row.enabled,
    region: row.region,
    ship_scope: row.shipScope,
    healthcheck_type: row.healthcheckType,
    healthcheck_interval_s: row.healthcheckIntervalS,
    timeout_ms: row.timeoutMs,
    // Không bao giờ trả giá trị secret — chỉ báo có cấu hình hay chưa (AGENT_COLLABORATION §5).
    secret_configured: row.secretRef !== null,
    check_config: row.checkConfig,
    in_maintenance: row.inMaintenance,
    config_version: row.configVersion,
    status: health?.status ?? 'UNKNOWN',
    is_active: health?.isActive ?? false,
    last_check_at: health?.lastCheckAt?.toISOString() ?? null,
    last_success_at: health?.lastSuccessAt?.toISOString() ?? null,
    last_rtt_ms: health?.lastRttMs ?? null,
    failure_count: health?.consecutiveFailures ?? 0,
    breaker_state: health?.breakerState ?? 'CLOSED',
    last_error: health?.lastError ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ServiceEndpointsService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly healthSweep: HealthSweepService,
  ) {}

  async list(filter: { serviceName?: string; environment?: string; enabled?: boolean }) {
    const conditions: SQL[] = [isNull(serviceEndpoints.deletedAt)];
    if (filter.serviceName) conditions.push(eq(serviceEndpoints.serviceName, filter.serviceName));
    if (filter.environment) conditions.push(eq(serviceEndpoints.environment, filter.environment));
    if (filter.enabled !== undefined) conditions.push(eq(serviceEndpoints.enabled, filter.enabled));

    const rows = await this.db
      .select()
      .from(serviceEndpoints)
      .leftJoin(serviceHealthState, eq(serviceHealthState.endpointId, serviceEndpoints.id))
      .where(and(...conditions))
      .orderBy(serviceEndpoints.serviceName, serviceEndpoints.priority);

    return rows.map((r) => toApi(r.service_endpoints, r.service_health_state));
  }

  async listServiceNames(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ serviceName: serviceEndpoints.serviceName })
      .from(serviceEndpoints)
      .where(isNull(serviceEndpoints.deletedAt));
    return rows.map((r) => r.serviceName).sort();
  }

  async getById(id: string) {
    const row = await this.findRowOrThrow(id);
    const health = await this.db.query.serviceHealthState.findFirst({ where: eq(serviceHealthState.endpointId, id) });
    return toApi(row, health);
  }

  async create(serviceName: string, input: CreateEndpointInput) {
    const existing = await this.db.query.serviceEndpoints.findFirst({
      where: and(
        eq(serviceEndpoints.serviceName, serviceName),
        eq(serviceEndpoints.environment, input.environment),
        eq(serviceEndpoints.host, input.host),
        eq(serviceEndpoints.port, input.port),
        eq(serviceEndpoints.protocol, input.protocol),
        isNull(serviceEndpoints.deletedAt),
      ),
    });
    if (existing) {
      throw new ApiException('ENDPOINT_ALREADY_EXISTS', `Endpoint already exists for ${serviceName} at ${input.host}:${input.port}`);
    }

    const [row] = await this.db
      .insert(serviceEndpoints)
      .values({
        serviceName,
        serviceType: input.service_type,
        environment: input.environment,
        host: input.host,
        port: input.port,
        protocol: input.protocol,
        priority: input.priority,
        region: input.region ?? null,
        shipScope: input.ship_scope,
        healthcheckType: input.healthcheck_type,
        healthcheckIntervalS: input.healthcheck_interval_s,
        timeoutMs: input.timeout_ms,
        secretRef: input.secret_ref ?? null,
        checkConfig: input.check_config,
        enabled: input.enabled,
      })
      .returning();

    await this.db.insert(serviceEndpointRevisions).values({
      endpointId: row.id,
      version: 1,
      payload: redactedSnapshot(row),
      changeReason: 'Initial creation',
      changedBy: getRequestContext().actorLabel,
    });

    this.events.emit(ENDPOINT_CHANGED_EVENT, { serviceName });
    await this.audit.record({
      action: 'service_endpoint.create',
      resourceType: 'service_endpoint',
      resourceId: row.id,
      after: redactedSnapshot(row),
      scope: { service_name: serviceName },
      result: 'SUCCESS',
    });
    return this.getById(row.id);
  }

  async update(id: string, input: UpdateEndpointInput) {
    const before = await this.findRowOrThrow(id);

    const [after] = await this.db
      .update(serviceEndpoints)
      .set({
        ...(input.host !== undefined && { host: input.host }),
        ...(input.port !== undefined && { port: input.port }),
        ...(input.protocol !== undefined && { protocol: input.protocol }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.region !== undefined && { region: input.region }),
        ...(input.ship_scope !== undefined && { shipScope: input.ship_scope }),
        ...(input.healthcheck_type !== undefined && { healthcheckType: input.healthcheck_type }),
        ...(input.healthcheck_interval_s !== undefined && { healthcheckIntervalS: input.healthcheck_interval_s }),
        ...(input.timeout_ms !== undefined && { timeoutMs: input.timeout_ms }),
        ...(input.secret_ref !== undefined && { secretRef: input.secret_ref }),
        ...(input.check_config !== undefined && { checkConfig: input.check_config }),
        configVersion: before.configVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(serviceEndpoints.id, id))
      .returning();

    await this.db.insert(serviceEndpointRevisions).values({
      endpointId: id,
      version: after.configVersion,
      payload: redactedSnapshot(after),
      changeReason: input.reason,
      changedBy: getRequestContext().actorLabel,
    });

    // Hot-reload: mọi process khác (chỉ 1 process trong dev, nhưng cùng shape với Redis
    // pub/sub multi-instance ở production — ADR-04) nhận sự kiện và bỏ cache ngay lập tức.
    this.events.emit(ENDPOINT_CHANGED_EVENT, { serviceName: after.serviceName });

    await this.audit.record({
      action: 'service_endpoint.update',
      resourceType: 'service_endpoint',
      resourceId: id,
      before: redactedSnapshot(before),
      after: redactedSnapshot(after),
      diff: diffRedacted(before, after),
      scope: { service_name: after.serviceName },
      reason: input.reason,
      result: 'SUCCESS',
    });
    return this.getById(id);
  }

  async remove(id: string) {
    const before = await this.findRowOrThrow(id);
    await this.assertNotLastHealthy(before, 'delete');

    await this.db.update(serviceEndpoints).set({ deletedAt: new Date(), enabled: false }).where(eq(serviceEndpoints.id, id));
    this.events.emit(ENDPOINT_CHANGED_EVENT, { serviceName: before.serviceName });
    await this.audit.record({
      action: 'service_endpoint.delete',
      resourceType: 'service_endpoint',
      resourceId: id,
      before: redactedSnapshot(before),
      scope: { service_name: before.serviceName },
      result: 'SUCCESS',
    });
  }

  async setEnabled(id: string, enabled: boolean) {
    const before = await this.findRowOrThrow(id);
    if (!enabled) await this.assertNotLastHealthy(before, 'disable');

    const [after] = await this.db.update(serviceEndpoints).set({ enabled, updatedAt: new Date() }).where(eq(serviceEndpoints.id, id)).returning();
    this.events.emit(ENDPOINT_CHANGED_EVENT, { serviceName: after.serviceName });
    await this.audit.record({
      action: enabled ? 'service_endpoint.enable' : 'service_endpoint.disable',
      resourceType: 'service_endpoint',
      resourceId: id,
      before: redactedSnapshot(before),
      after: redactedSnapshot(after),
      scope: { service_name: after.serviceName },
      result: 'SUCCESS',
    });
    return this.getById(id);
  }

  async setMaintenance(id: string, input: MaintenanceInput) {
    const before = await this.findRowOrThrow(id);
    const [after] = await this.db
      .update(serviceEndpoints)
      .set({ inMaintenance: input.enable, updatedAt: new Date() })
      .where(eq(serviceEndpoints.id, id))
      .returning();

    if (input.enable) {
      await this.db
        .insert(serviceHealthState)
        .values({ endpointId: id, status: 'MAINTENANCE', isActive: false })
        .onConflictDoUpdate({ target: serviceHealthState.endpointId, set: { status: 'MAINTENANCE', isActive: false } });
    }

    await this.audit.record({
      action: input.enable ? 'service_endpoint.maintenance_on' : 'service_endpoint.maintenance_off',
      resourceType: 'service_endpoint',
      resourceId: id,
      before: redactedSnapshot(before),
      after: redactedSnapshot(after),
      scope: { service_name: after.serviceName },
      reason: input.reason,
      result: 'SUCCESS',
    });
    return this.getById(id);
  }

  async triggerCheck(id: string) {
    await this.findRowOrThrow(id);
    const did = await this.healthSweep.sweepEndpointById(id);
    return { checked: did, ...(await this.getById(id)) };
  }

  async listRevisions(id: string) {
    await this.findRowOrThrow(id);
    const rows = await this.db
      .select()
      .from(serviceEndpointRevisions)
      .where(eq(serviceEndpointRevisions.endpointId, id))
      .orderBy(desc(serviceEndpointRevisions.version));
    return rows.map((r) => ({
      version: r.version,
      payload: r.payload,
      change_reason: r.changeReason,
      changed_by: r.changedBy,
      created_at: r.createdAt.toISOString(),
    }));
  }

  private async findRowOrThrow(id: string) {
    const row = await this.db.query.serviceEndpoints.findFirst({ where: and(eq(serviceEndpoints.id, id), isNull(serviceEndpoints.deletedAt)) });
    if (!row) throw new ApiException('ENDPOINT_NOT_FOUND', `Service endpoint ${id} not found`);
    return row;
  }

  /** Không cho tự cắt chân: không được xoá/disable endpoint HEALTHY cuối cùng của một service. */
  private async assertNotLastHealthy(row: typeof serviceEndpoints.$inferSelect, action: string) {
    const siblings = await this.db
      .select({ id: serviceEndpoints.id, status: serviceHealthState.status })
      .from(serviceEndpoints)
      .leftJoin(serviceHealthState, eq(serviceHealthState.endpointId, serviceEndpoints.id))
      .where(and(eq(serviceEndpoints.serviceName, row.serviceName), eq(serviceEndpoints.enabled, true), isNull(serviceEndpoints.deletedAt)));

    const otherHealthy = siblings.filter((s) => s.id !== row.id && (s.status === 'HEALTHY' || s.status === 'DEGRADED'));
    const thisIsHealthy = siblings.find((s) => s.id === row.id)?.status === 'HEALTHY' || siblings.find((s) => s.id === row.id)?.status === 'DEGRADED';

    if (thisIsHealthy && otherHealthy.length === 0) {
      throw new ApiException(
        'LAST_HEALTHY_ENDPOINT',
        `Cannot ${action} the last healthy endpoint of service "${row.serviceName}"`,
        { service_name: row.serviceName },
      );
    }
  }
}

function redactedSnapshot(row: typeof serviceEndpoints.$inferSelect) {
  const { secretRef, ...rest } = row;
  return { ...rest, secret_configured: secretRef !== null };
}

function diffRedacted(before: typeof serviceEndpoints.$inferSelect, after: typeof serviceEndpoints.$inferSelect) {
  const b = redactedSnapshot(before);
  const a = redactedSnapshot(after);
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(a)) {
    if (JSON.stringify((b as any)[key]) !== JSON.stringify((a as any)[key])) {
      diff[key] = { before: (b as any)[key], after: (a as any)[key] };
    }
  }
  if (before.secretRef !== after.secretRef) diff['secret_ref'] = { changed: true };
  return diff;
}
