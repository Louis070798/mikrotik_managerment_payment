import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, max } from 'drizzle-orm';
import { ApiException } from '@common/api-exception';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { interfaces, rawTelemetryEvents } from '@db/schema';
import { InventoryCacheService } from '@inventory-cache/inventory-cache.service';
import { NormalizationService } from '@telemetry-normalize/normalization.service';
import { hashTelemetryPayload, sourceHealth, TELEMETRY_SOURCES, TELEMETRY_STALE_AFTER_SECONDS } from './contract';
import { TelemetryEventInput, TelemetryIngestRequest, TelemetrySource } from './dto';

type ResolvedIdentity = {
  ship_id: string | null;
  device_id: string | null;
  interface_id: string | null;
  user_identity: string | null;
  user_identity_type: string | null;
  source_device_ref: string | null;
  source_interface_ref: string | null;
};

@Injectable()
export class TelemetryService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: DbClient,
    private readonly normalization: NormalizationService,
    private readonly inventoryCache: InventoryCacheService,
  ) {}

  /**
   * Device/ship tra qua InventoryCacheService (bộ nhớ, làm mới định kỳ) thay vì query DB — hàm này
   * chạy CHO MỖI EVENT (1 gói NetFlow có thể mang hàng chục event), là 1 trong 2 nguồn truy vấn lặp
   * lại nhiều nhất từng gây bão hoà connection pool khi có traffic thật liên tục (xem
   * InventoryCacheService). interfaceId hiếm gặp trên các nguồn tần suất cao (NetFlow/RADIUS chỉ set
   * device_id/ship_id) nên vẫn query DB trực tiếp — không đáng để cache thêm 1 bảng nữa.
   */
  private async resolveIdentity(event: TelemetryEventInput): Promise<ResolvedIdentity> {
    const identity = event.identity;
    let shipId = identity.ship_id ?? null;
    let deviceId = identity.device_id ?? null;
    let interfaceId = identity.interface_id ?? null;

    if (shipId) {
      const ship = this.inventoryCache.shipByShipId(shipId);
      if (!ship) throw new ApiException('TELEMETRY_IDENTITY_CONFLICT', `Ship identity ${shipId} was not found`);
    }
    if (deviceId) {
      const device = this.inventoryCache.deviceByDeviceId(deviceId);
      if (!device) throw new ApiException('TELEMETRY_IDENTITY_CONFLICT', `Device identity ${deviceId} was not found`);
      if (shipId && device.shipId !== shipId) {
        throw new ApiException('TELEMETRY_IDENTITY_CONFLICT', 'Device does not belong to the supplied ship', {
          ship_id: shipId,
          device_id: deviceId,
        });
      }
      shipId = shipId ?? device.shipId;
    }
    if (interfaceId) {
      const iface = await this.db.query.interfaces.findFirst({ where: eq(interfaces.id, interfaceId) });
      if (!iface) throw new ApiException('TELEMETRY_IDENTITY_CONFLICT', `Interface identity ${interfaceId} was not found`);
      if (deviceId && iface.deviceId !== deviceId) {
        throw new ApiException('TELEMETRY_IDENTITY_CONFLICT', 'Interface does not belong to the supplied device', {
          device_id: deviceId,
          interface_id: interfaceId,
        });
      }
      deviceId = deviceId ?? iface.deviceId;
      const device = this.inventoryCache.deviceByDeviceId(iface.deviceId);
      shipId = shipId ?? device?.shipId ?? null;
    }

    const payloadUser = event.payload?.username;
    return {
      ship_id: shipId,
      device_id: deviceId,
      interface_id: interfaceId,
      user_identity: identity.user_identity ?? (typeof payloadUser === 'string' ? payloadUser : null),
      user_identity_type: identity.user_identity_type ?? (typeof payloadUser === 'string' ? 'USERNAME' : null),
      source_device_ref: identity.source_device_ref ?? null,
      source_interface_ref: identity.source_interface_ref ?? null,
    };
  }

  private eventResult(status: 'ACCEPTED' | 'DUPLICATE', event: TelemetryEventInput, id: string, normalized: boolean | null = null) {
    return {
      event_id: id,
      source: event.source,
      idempotency_key: event.idempotency_key,
      status,
      observed_at: event.observed_at,
      // null = not attempted (duplicate — already normalized on first ingest, or normalization
      // skipped); true/false = normalization.processEvent() outcome for this ingest call.
      normalized,
    };
  }

  async ingest(request: TelemetryIngestRequest) {
    const results: Array<ReturnType<TelemetryService['eventResult']>> = [];
    const receivedSources = new Set<TelemetrySource>();

    for (const event of request.events) {
      const payloadHash = hashTelemetryPayload(event.payload, event.raw_reference, {
        source: event.source,
        source_event_id: event.source_event_id,
        observed_at: event.observed_at,
        identity: event.identity,
        metadata: event.metadata,
      });
      const existing = await this.db.query.rawTelemetryEvents.findFirst({
        where: and(eq(rawTelemetryEvents.source, event.source), eq(rawTelemetryEvents.idempotencyKey, event.idempotency_key)),
      });
      if (existing) {
        if (existing.payloadHashSha256 !== payloadHash) {
          throw new ApiException('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with different content', {
            source: event.source,
            idempotency_key: event.idempotency_key,
            existing_event_id: existing.id,
          });
        }
        results.push(this.eventResult('DUPLICATE', event, existing.id));
        receivedSources.add(event.source);
        continue;
      }

      const identity = await this.resolveIdentity(event);

      const [inserted] = await this.db
        .insert(rawTelemetryEvents)
        .values({
          source: event.source,
          idempotencyKey: event.idempotency_key,
          sourceEventId: event.source_event_id ?? null,
          shipId: identity.ship_id,
          deviceId: identity.device_id,
          interfaceId: identity.interface_id,
          userIdentity: identity.user_identity,
          userIdentityType: identity.user_identity_type,
          sourceDeviceRef: identity.source_device_ref,
          sourceInterfaceRef: identity.source_interface_ref,
          observedAt: new Date(event.observed_at),
          payload: event.payload ?? null,
          rawReference: event.raw_reference ?? null,
          payloadHashSha256: payloadHash,
          metadata: event.metadata,
        })
        .onConflictDoNothing({ target: [rawTelemetryEvents.source, rawTelemetryEvents.idempotencyKey] })
        .returning();

      if (!inserted) {
        const raced = await this.db.query.rawTelemetryEvents.findFirst({
          where: and(eq(rawTelemetryEvents.source, event.source), eq(rawTelemetryEvents.idempotencyKey, event.idempotency_key)),
        });
        if (!raced) throw new ApiException('INTERNAL_ERROR', 'Telemetry event could not be persisted');
        if (raced.payloadHashSha256 !== payloadHash) {
          throw new ApiException('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with different content');
        }
        results.push(this.eventResult('DUPLICATE', event, raced.id));
      } else {
        // Synchronous normalization stand-in for the NATS-consumer worker described in ADR-03 —
        // see NormalizationService for the full rationale. A failure here does not fail ingest:
        // the raw event is already durably persisted (SYSTEM_SPEC §11 raw-immutable requirement),
        // and normalization.processPending() can retry it later.
        const normResult = await this.normalization.processEvent(inserted.id, inserted);
        results.push(this.eventResult('ACCEPTED', event, inserted.id, normResult.ok));
      }
      receivedSources.add(event.source);
    }

    const duplicateCount = results.filter((result) => result.status === 'DUPLICATE').length;
    const acceptedResults = results.filter((result) => result.status === 'ACCEPTED');
    const normalizedCount = acceptedResults.filter((result) => result.normalized === true).length;
    return {
      data: {
        accepted_count: results.length - duplicateCount,
        duplicate_count: duplicateCount,
        events: results,
        persistence: 'raw_telemetry_events',
        // true only when every accepted event in this batch was actually normalized into the
        // interface_counter_*/radius_*/ipfix_flow_records tables — never fabricated as true.
        analytics_processed: acceptedResults.length > 0 && normalizedCount === acceptedResults.length,
      },
      meta: {
        freshness_by_source: Object.fromEntries([...receivedSources].map((source) => [source, 0])),
        warnings: duplicateCount > 0 ? [{ code: 'DUPLICATE_EVENTS_SKIPPED', message: 'Duplicate events were acknowledged without a second insert' }] : [],
      },
    };
  }

  /** Manual catch-up/reprocess trigger — see NormalizationService for why this exists. */
  async normalizePending(opts: { limit?: number; source?: TelemetrySource }) {
    const summary = await this.normalization.processPending(opts);
    return { data: summary, meta: {} };
  }

  async health() {
    const rows = await this.db
      .select({ source: rawTelemetryEvents.source, eventCount: count(rawTelemetryEvents.id), lastReceivedAt: max(rawTelemetryEvents.receivedAt) })
      .from(rawTelemetryEvents)
      .groupBy(rawTelemetryEvents.source);
    const rowBySource = new Map(rows.map((row) => [row.source, row]));
    const now = new Date();
    const sources = TELEMETRY_SOURCES.map((source) => {
      const row = rowBySource.get(source);
      return sourceHealth(source, Number(row?.eventCount ?? 0), row?.lastReceivedAt ?? null, now);
    });
    const freshness = sources.map((source) => source.freshness_seconds).filter((value): value is number => value !== null);
    const hasEvents = sources.some((source) => source.event_count > 0);
    const status = !hasEvents ? 'UNKNOWN' : sources.some((source) => source.status === 'DEGRADED') ? 'DEGRADED' : 'HEALTHY';
    const warnings = !hasEvents
      ? [{ code: 'TELEMETRY_SOURCE_EMPTY', message: 'No raw telemetry event has been ingested yet' }]
      : sources.some((source) => source.status === 'DEGRADED')
        ? [{ code: 'TELEMETRY_SOURCE_STALE', message: `At least one telemetry source is older than ${TELEMETRY_STALE_AFTER_SECONDS} seconds` }]
        : [];

    return {
      data: {
        status,
        raw_store: {
          status: 'HEALTHY',
          latest_received_at: (() => {
            const received = sources.map((source) => source.last_received_at).filter(Boolean).sort();
            return received.length > 0 ? received[received.length - 1] : null;
          })(),
        },
        sources,
      },
      meta: {
        data_freshness_seconds: freshness.length > 0 ? Math.max(...freshness) : null,
        freshness_by_source: Object.fromEntries(sources.map((source) => [source.source, source.freshness_seconds])),
        warnings,
      },
    };
  }
}
