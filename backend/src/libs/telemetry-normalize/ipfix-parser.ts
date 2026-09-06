import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { DbClient } from '@db/db.module';
import { identityBindings, ipfixFlowRecords, rawTelemetryEvents } from '@db/schema';
import { DnsResolutionCacheService } from '@dns-resolution-cache/dns-resolution-cache.service';
import { classifyFlow } from './classifier';
import { NORMALIZER_PARSER_VERSION } from './parser-version';

export type NormalizeResult = { ok: true; note?: string } | { ok: false; reason: string };

function toByteCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}
function toInt(value: unknown): number | null {
  const n = toByteCount(value);
  return n === null ? null : Math.trunc(n);
}
function toStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const IDENTITY_SOURCE_PRIORITY = ['RADIUS', 'HOTSPOT', 'DHCP', 'ARP'] as const;

/**
 * ADR-12 identity correlation: find the identity_bindings row covering (ship_id, client_ip,
 * event_time) at the highest-priority source. This is the Postgres stand-in for the ClickHouse
 * ASOF JOIN described in 02-DATABASE_DESIGN.md §0/§4.4 — same semantics, different engine.
 * Only the RADIUS source is ever populated in this phase (see radius-parser.ts); HotSpot/DHCP/ARP
 * collectors do not exist yet, so this function will only ever resolve a RADIUS binding today.
 */
async function findIdentityBinding(db: DbClient, shipId: string, clientIp: string, observedAt: Date) {
  const candidates = await db.query.identityBindings.findMany({
    where: and(
      eq(identityBindings.shipId, shipId),
      eq(identityBindings.clientIp, clientIp),
      lte(identityBindings.validFrom, observedAt),
      or(isNull(identityBindings.validTo), gt(identityBindings.validTo, observedAt)),
    ),
    orderBy: [desc(identityBindings.confidence)],
  });
  if (candidates.length === 0) return null;
  for (const source of IDENTITY_SOURCE_PRIORITY) {
    const match = candidates.find((c) => c.source === source);
    if (match) return match;
  }
  return candidates[0];
}

export async function normalizeIpfixFlowEvent(
  db: DbClient,
  event: typeof rawTelemetryEvents.$inferSelect,
  dnsCache: DnsResolutionCacheService,
): Promise<NormalizeResult> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const bytes = toByteCount(payload.bytes);
  const srcIp = toStr(payload.src_ip);
  const dstIp = toStr(payload.dst_ip);
  if (bytes === null || !srcIp || !dstIp) {
    return { ok: false, reason: 'INVALID_FLOW_PAYLOAD' };
  }

  const binding = event.shipId ? await findIdentityBinding(db, event.shipId, srcIp, event.observedAt) : null;
  const classified = classifyFlow(dnsCache, event.deviceId, srcIp, dstIp);

  await db.insert(ipfixFlowRecords).values({
    shipId: event.shipId,
    deviceId: event.deviceId,
    observedAt: event.observedAt,
    srcIp,
    dstIp,
    srcPort: toInt(payload.src_port),
    dstPort: toInt(payload.dst_port),
    protocol: toInt(payload.protocol),
    bytes,
    packets: toByteCount(payload.packets),
    inInterfaceId: event.interfaceId,
    outInterfaceId: null,
    vlanId: toInt(payload.vlan_id),
    srcMac: toStr(payload.src_mac),
    direction: toStr(payload.direction),
    identityUsername: binding?.username ?? null,
    identitySource: binding?.source ?? null,
    identityConfidence: binding?.confidence ?? null,
    // Phân loại thật qua DNS log (classifier.ts) — chỉ có IP catalog/ASN/TLS-SNI (tầng 3/4 tài
    // liệu tham khảo) là chưa làm trong Phase A; những flow không có bản ghi DNS phù hợp vẫn
    // trung thực là UNKNOWN thay vì đoán, đúng contract classification_method + unknown_reason.
    classificationMethod: classified.method,
    classificationConfidence: classified.confidence === null ? null : String(classified.confidence),
    unknownReason: classified.unknownReason,
    domain: classified.domain,
    app: classified.app,
    rawEventId: event.id,
    parserVersion: NORMALIZER_PARSER_VERSION,
  });

  return { ok: true };
}
