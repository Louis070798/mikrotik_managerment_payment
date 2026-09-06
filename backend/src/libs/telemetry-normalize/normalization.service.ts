import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { rawTelemetryEvents } from '@db/schema';
import { DnsResolutionCacheService } from '@dns-resolution-cache/dns-resolution-cache.service';
import { normalizeInterfaceCounterEvent } from './interface-parser';
import { normalizeRadiusAccountingEvent } from './radius-parser';
import { normalizeIpfixFlowEvent } from './ipfix-parser';

export type NormalizeSummary = { scanned: number; normalized: number; failed: number; details: Array<{ id: string; ok: boolean; note?: string }> };

/**
 * Normalization worker — the Postgres-synchronous stand-in for the "collector -> NATS -> raw-writer
 * -> rollup job" pipeline in ADR-02/ADR-03. There is no NATS/worker process in this sandbox, so:
 *   - TelemetryService.ingest() calls processEvent() synchronously for each accepted event, so
 *     data is normalized immediately after ingest with no separate consumer to run.
 *   - processPending() is exposed via POST /telemetry/normalize for manual catch-up/reprocessing
 *     of anything left with processed_at IS NULL (e.g. events that failed transiently).
 * This is a deliberate, documented simplification — see the phase report for what a real NATS
 * consumer + ClickHouse raw-writer would add (replay, backpressure, cross-process scaling).
 */
@Injectable()
export class NormalizationService {
  private readonly logger = new Logger(NormalizationService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly dnsCache: DnsResolutionCacheService,
  ) {}

  /**
   * `preloadedEvent` — TelemetryService.ingest() đã có nguyên dòng vừa insert (qua `.returning()`),
   * truyền thẳng vào đây để khỏi phải SELECT lại đúng dòng đó lần nữa (1 trong 2 nguồn truy vấn lặp
   * lại nhiều nhất từng gây bão hoà connection pool, xem InventoryCacheService). processPending()
   * (đường catch-up thủ công) vẫn gọi không kèm tham số này — SELECT như cũ.
   */
  async processEvent(eventId: string, preloadedEvent?: typeof rawTelemetryEvents.$inferSelect): Promise<{ ok: boolean; note?: string }> {
    const event = preloadedEvent ?? (await this.db.query.rawTelemetryEvents.findFirst({ where: eq(rawTelemetryEvents.id, eventId) }));
    if (!event) return { ok: false, note: 'EVENT_NOT_FOUND' };
    if (event.processedAt) return { ok: true, note: 'ALREADY_PROCESSED' };

    try {
      const result = await this.dispatch(event);
      if (result.ok) {
        await this.db
          .update(rawTelemetryEvents)
          .set({ processedAt: new Date(), processingError: result.note ?? null })
          .where(eq(rawTelemetryEvents.id, eventId));
        return { ok: true, note: result.note };
      }
      await this.db
        .update(rawTelemetryEvents)
        .set({ processedAt: new Date(), processingError: result.reason })
        .where(eq(rawTelemetryEvents.id, eventId));
      return { ok: false, note: result.reason };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown normalization error';
      this.logger.error(`Normalization failed for event ${eventId}: ${message}`);
      // Deliberately do NOT set processed_at here — leave it pending so processPending() retries
      // on the next catch-up run instead of silently dropping the event.
      await this.db.update(rawTelemetryEvents).set({ processingError: message }).where(eq(rawTelemetryEvents.id, eventId));
      return { ok: false, note: message };
    }
  }

  private dispatch(event: typeof rawTelemetryEvents.$inferSelect) {
    switch (event.source) {
      case 'INTERFACE_COUNTER':
        return normalizeInterfaceCounterEvent(this.db, event);
      case 'RADIUS_ACCOUNTING':
        return normalizeRadiusAccountingEvent(this.db, event);
      case 'IPFIX_FLOW':
        return normalizeIpfixFlowEvent(this.db, event, this.dnsCache);
      default:
        return Promise.resolve({ ok: false as const, reason: 'UNKNOWN_SOURCE' });
    }
  }

  async processPending(opts: { limit?: number; source?: string } = {}): Promise<NormalizeSummary> {
    const limit = Math.min(opts.limit ?? 200, 1000);
    const rows = await this.db
      .select({ id: rawTelemetryEvents.id })
      .from(rawTelemetryEvents)
      .where(
        and(
          isNull(rawTelemetryEvents.processedAt),
          ...(opts.source ? [eq(rawTelemetryEvents.source, opts.source as any)] : []),
        ),
      )
      .orderBy(asc(rawTelemetryEvents.receivedAt))
      .limit(limit);

    const details: NormalizeSummary['details'] = [];
    let normalized = 0;
    let failed = 0;
    for (const row of rows) {
      const result = await this.processEvent(row.id);
      details.push({ id: row.id, ok: result.ok, note: result.note });
      if (result.ok) normalized++;
      else failed++;
    }
    return { scanned: rows.length, normalized, failed, details };
  }
}
