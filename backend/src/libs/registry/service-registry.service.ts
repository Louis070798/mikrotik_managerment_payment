import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { serviceEndpoints } from '@db/schema';
import { ENDPOINT_CHANGED_EVENT, EndpointCandidate } from './registry.types';

/**
 * ServiceRegistry — ADR-04. Đây là NƠI DUY NHẤT trong codebase được phép biết địa chỉ
 * thật của RADIUS/database/collector/... Mọi module khác gọi registry.resolve(serviceName),
 * KHÔNG BAO GIỜ đọc host/port từ process.env hoặc hard-code (enforce thêm bằng lint rule
 * ở CI — xem ghi chú cuối 01-BACKEND_DESIGN.md ADR-04).
 *
 * Cache in-memory, invalidate qua EventEmitter2 khi có thay đổi (ADR-04 mô tả Redis pub/sub
 * cho multi-instance; ở đây dùng in-process event vì sandbox không có Redis — cùng shape,
 * đổi implementation sau không cần đổi call site).
 */
@Injectable()
export class ServiceRegistry {
  private readonly logger = new Logger(ServiceRegistry.name);
  private cache = new Map<string, EndpointCandidate[]>();
  private cacheLoadedAt = new Map<string, number>();

  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  @OnEvent(ENDPOINT_CHANGED_EVENT)
  handleEndpointChanged(payload: { serviceName: string }) {
    this.cache.delete(payload.serviceName);
    this.cacheLoadedAt.delete(payload.serviceName);
    this.logger.debug(`Cache invalidated for service_name=${payload.serviceName}`);
  }

  /** Chỉ dùng cho test — buộc bỏ toàn bộ cache. */
  invalidateAll(): void {
    this.cache.clear();
    this.cacheLoadedAt.clear();
  }

  async resolve(serviceName: string, opts: { includeDisabled?: boolean } = {}): Promise<EndpointCandidate[]> {
    if (!opts.includeDisabled) {
      const cached = this.cache.get(serviceName);
      if (cached) return cached;
    }

    const rows = await this.db
      .select()
      .from(serviceEndpoints)
      .where(
        and(
          eq(serviceEndpoints.serviceName, serviceName),
          isNull(serviceEndpoints.deletedAt),
          ...(opts.includeDisabled ? [] : [eq(serviceEndpoints.enabled, true)]),
        ),
      )
      .orderBy(asc(serviceEndpoints.priority));

    const candidates: EndpointCandidate[] = rows.map((r) => ({
      id: r.id,
      serviceName: r.serviceName,
      serviceType: r.serviceType,
      host: r.host,
      port: r.port,
      protocol: r.protocol,
      priority: r.priority,
      healthcheckType: r.healthcheckType,
      healthcheckIntervalS: r.healthcheckIntervalS,
      timeoutMs: r.timeoutMs,
      secretRef: r.secretRef,
      tls: r.tls,
      checkConfig: (r.checkConfig as Record<string, unknown>) ?? {},
      inMaintenance: r.inMaintenance,
      shipScope: r.shipScope,
    }));

    if (!opts.includeDisabled) {
      this.cache.set(serviceName, candidates);
      this.cacheLoadedAt.set(serviceName, Date.now());
    }
    return candidates;
  }

  async listServiceNames(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ serviceName: serviceEndpoints.serviceName })
      .from(serviceEndpoints)
      .where(isNull(serviceEndpoints.deletedAt));
    return rows.map((r) => r.serviceName);
  }
}
