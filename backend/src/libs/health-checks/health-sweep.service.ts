import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, isNull, asc } from 'drizzle-orm';
import * as crypto from 'node:crypto';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { serviceEndpoints, serviceHealthState } from '@db/schema';
import { ENV_TOKEN } from '@config/config.module';
import type { Env } from '@config/env.schema';
import { CircuitBreakerStore } from '@registry/circuit-breaker-store';
import { retryWithTimeout } from '@registry/retry';
import { AlertsService } from '@alerts-lib/alerts.service';
import { EndpointCandidate } from '@registry/registry.types';
import { RadiusHealthChecker } from './radius.checker';
import { DatabaseHealthChecker } from './database.checker';
import { CollectorHealthChecker } from './collector.checker';
import { BackupHealthChecker } from './backup.checker';
import { HealthChecker, HealthStatus } from './types';

const ALERT_KIND_BY_SERVICE_TYPE: Record<string, string> = {
  RADIUS: 'RADIUS_FAILURE',
  RADIUS_ACCT: 'RADIUS_FAILURE',
  DATABASE: 'DATABASE_FAILURE',
  COLLECTOR: 'COLLECTOR_DELAYED',
  STORAGE: 'BACKUP_OVERDUE',
};

function fingerprintFor(endpointId: string): string {
  return crypto.createHash('sha256').update(`endpoint-unhealthy:${endpointId}`).digest('hex');
}

/**
 * Health sweep — chạy định kỳ (interval cấu hình được qua HEALTH_SWEEP_INTERVAL_MS, KHÔNG
 * hard-code) và có thể gọi thủ công qua sweepOne() (dùng bởi POST /service-endpoints/{id}/check).
 *
 * Với mỗi endpoint: chọn checker theo service_type → retry+timeout → cập nhật circuit breaker
 * → ghi service_health_state → fire/resolve alert khi UNHEALTHY (item #11). Sau đó tính lại
 * endpoint nào đang "active" cho mỗi service_name (ưu tiên thấp nhất trong số HEALTHY/DEGRADED).
 */
@Injectable()
export class HealthSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    @Inject(ENV_TOKEN) private readonly env: Env,
    private readonly breakerStore: CircuitBreakerStore,
    private readonly alertsService: AlertsService,
    private readonly radiusChecker: RadiusHealthChecker,
    private readonly databaseChecker: DatabaseHealthChecker,
    private readonly collectorChecker: CollectorHealthChecker,
    private readonly backupChecker: BackupHealthChecker,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit() {
    if (this.env.NODE_ENV === 'test') return; // test tự gọi sweepOnce() một cách tường minh
    this.timer = setInterval(() => {
      this.sweepOnce().catch((err) => this.logger.error(`Health sweep failed: ${err.message}`, err.stack));
    }, this.env.HEALTH_SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private checkerFor(serviceType: string): HealthChecker | null {
    switch (serviceType) {
      case 'RADIUS':
      case 'RADIUS_ACCT':
        return this.radiusChecker;
      case 'DATABASE':
        return this.databaseChecker;
      case 'COLLECTOR':
        return this.collectorChecker;
      case 'STORAGE':
        return this.backupChecker;
      default:
        return null; // USER_MANAGER/CONTROLLER/BUS/CACHE/ZEROTIER — chưa có checker trong phạm vi task này
    }
  }

  async sweepOnce(): Promise<{ checked: number; skipped: number }> {
    const rows = await this.db
      .select()
      .from(serviceEndpoints)
      .where(and(eq(serviceEndpoints.enabled, true), isNull(serviceEndpoints.deletedAt)));

    let checked = 0;
    let skipped = 0;
    const touchedServiceNames = new Set<string>();

    await Promise.all(
      rows.map(async (row) => {
        touchedServiceNames.add(row.serviceName);
        const didCheck = await this.checkOne(row);
        if (didCheck) checked++;
        else skipped++;
      }),
    );

    for (const serviceName of touchedServiceNames) {
      await this.recomputeActive(serviceName);
    }

    return { checked, skipped };
  }

  /** Chạy check cho đúng một endpoint (id) — dùng bởi API POST /service-endpoints/{id}/check. */
  async sweepEndpointById(endpointId: string): Promise<boolean> {
    const [row] = await this.db.select().from(serviceEndpoints).where(eq(serviceEndpoints.id, endpointId));
    if (!row) return false;
    const did = await this.checkOne(row, { force: true });
    await this.recomputeActive(row.serviceName);
    return did;
  }

  private async checkOne(row: typeof serviceEndpoints.$inferSelect, opts: { force?: boolean } = {}): Promise<boolean> {
    if (row.inMaintenance) {
      await this.upsertState(row.id, { status: 'MAINTENANCE', isActive: false });
      return false;
    }

    const checker = this.checkerFor(row.serviceType);
    if (!checker) {
      this.logger.debug(`No health checker registered for service_type=${row.serviceType}, skipping ${row.serviceName}`);
      return false;
    }

    const breaker = this.breakerStore.get(row.id, {
      failureThreshold: this.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      cooldownMs: this.env.CIRCUIT_BREAKER_COOLDOWN_MS,
    });

    if (!opts.force && !breaker.canProbe()) {
      return false; // breaker OPEN, chưa hết cooldown — không hammering endpoint đang chết
    }

    const candidate: EndpointCandidate = {
      id: row.id,
      serviceName: row.serviceName,
      serviceType: row.serviceType,
      host: row.host,
      port: row.port,
      protocol: row.protocol,
      priority: row.priority,
      healthcheckType: row.healthcheckType,
      healthcheckIntervalS: row.healthcheckIntervalS,
      timeoutMs: row.timeoutMs,
      secretRef: row.secretRef,
      tls: row.tls,
      checkConfig: (row.checkConfig as Record<string, unknown>) ?? {},
      inMaintenance: row.inMaintenance,
      shipScope: row.shipScope,
    };

    const retryResult = await retryWithTimeout((_attempt) => this.runChecker(checker, candidate), {
      maxAttempts: this.env.HEALTH_CHECK_MAX_RETRIES + 1,
      timeoutMs: row.timeoutMs + 1000, // buffer nhỏ so với timeout nội bộ của checker
    });

    const fingerprint = fingerprintFor(row.id);

    if (retryResult.ok && retryResult.value?.success) {
      breaker.onSuccess();
      const status: HealthStatus = retryResult.value.degraded ? 'DEGRADED' : 'HEALTHY';
      await this.upsertState(row.id, {
        status,
        consecutiveFailures: 0,
        breakerState: 'CLOSED',
        breakerOpenedAt: null,
        lastRttMs: retryResult.value.rttMs ?? null,
        lastError: retryResult.value.errorMessage ? { message: retryResult.value.errorMessage } : null,
        lastCheckAt: new Date(),
        lastSuccessAt: new Date(),
        details: retryResult.value.details ?? null,
      });
      await this.alertsService.resolveByFingerprint(fingerprint, `Endpoint recovered — status=${status}`);
    } else {
      breaker.onFailure();
      const snap = breaker.snapshot();
      const errorMessage = retryResult.value?.errorMessage ?? retryResult.error?.message ?? 'Unknown failure';
      await this.upsertState(row.id, {
        status: 'UNHEALTHY',
        consecutiveFailures: snap.consecutiveFailures,
        breakerState: snap.state,
        breakerOpenedAt: snap.openedAt ? new Date(snap.openedAt) : null,
        lastRttMs: null,
        lastError: { message: errorMessage, attempts: retryResult.attemptLog },
        lastCheckAt: new Date(),
        details: retryResult.value?.details ?? null,
      });

      const alertKind = ALERT_KIND_BY_SERVICE_TYPE[row.serviceType] ?? 'ENDPOINT_UNHEALTHY';
      await this.alertsService.fireOrUpdate({
        kind: alertKind,
        fingerprint,
        severity: 'MAJOR',
        scope: { service_name: row.serviceName, endpoint_id: row.id, service_type: row.serviceType },
        title: `${row.serviceName} (${row.host}:${row.port}) is UNHEALTHY`,
        summary: errorMessage,
        evidence: { consecutive_failures: snap.consecutiveFailures, attempts: retryResult.attemptLog },
      });
    }

    return true;
  }

  private async runChecker(checker: HealthChecker, candidate: EndpointCandidate) {
    const result = await checker.check(candidate);
    if (!result.success) {
      // Chuyển kết quả "thất bại nhưng không throw" thành throw để retryWithTimeout tính là 1 lần thử hỏng.
      const err = new Error(result.errorMessage ?? 'Health check failed');
      (err as any).partialResult = result;
      throw err;
    }
    return result;
  }

  private async upsertState(
    endpointId: string,
    patch: Partial<{
      status: HealthStatus;
      consecutiveFailures: number;
      breakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
      breakerOpenedAt: Date | null;
      lastRttMs: number | null;
      lastError: Record<string, unknown> | null;
      lastCheckAt: Date;
      lastSuccessAt: Date;
      isActive: boolean;
      details: Record<string, unknown> | null;
    }>,
  ): Promise<void> {
    const existing = await this.db.query.serviceHealthState.findFirst({
      where: eq(serviceHealthState.endpointId, endpointId),
    });

    if (!existing) {
      await this.db.insert(serviceHealthState).values({
        endpointId,
        status: patch.status ?? 'UNKNOWN',
        since: new Date(),
        consecutiveFailures: patch.consecutiveFailures ?? 0,
        breakerState: patch.breakerState ?? 'CLOSED',
        breakerOpenedAt: patch.breakerOpenedAt ?? null,
        lastRttMs: patch.lastRttMs ?? null,
        lastError: patch.lastError ?? null,
        lastCheckAt: patch.lastCheckAt ?? null,
        lastSuccessAt: patch.lastSuccessAt ?? null,
        isActive: patch.isActive ?? false,
        details: patch.details ?? null,
      });
      return;
    }

    const statusChanged = patch.status !== undefined && patch.status !== existing.status;
    await this.db
      .update(serviceHealthState)
      .set({
        ...patch,
        since: statusChanged ? new Date() : existing.since,
      })
      .where(eq(serviceHealthState.endpointId, endpointId));
  }

  /** Chọn endpoint ưu tiên thấp nhất trong số HEALTHY/DEGRADED làm active cho một service_name. */
  private async recomputeActive(serviceName: string): Promise<void> {
    const rows = await this.db
      .select({
        id: serviceEndpoints.id,
        priority: serviceEndpoints.priority,
        status: serviceHealthState.status,
      })
      .from(serviceEndpoints)
      .leftJoin(serviceHealthState, eq(serviceHealthState.endpointId, serviceEndpoints.id))
      .where(
        and(eq(serviceEndpoints.serviceName, serviceName), eq(serviceEndpoints.enabled, true), isNull(serviceEndpoints.deletedAt)),
      )
      .orderBy(asc(serviceEndpoints.priority));

    const activeCandidate = rows.find((r) => r.status === 'HEALTHY' || r.status === 'DEGRADED');

    for (const r of rows) {
      const shouldBeActive = activeCandidate ? r.id === activeCandidate.id : false;
      await this.db
        .update(serviceHealthState)
        .set({ isActive: shouldBeActive })
        .where(eq(serviceHealthState.endpointId, r.id));
    }

    if (activeCandidate) {
      this.events.emit('registry.active-endpoint.changed', { serviceName, endpointId: activeCandidate.id });
    }
  }
}
