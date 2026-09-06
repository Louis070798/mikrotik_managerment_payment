import { and, desc, eq, lt } from 'drizzle-orm';
import { DbClient } from '@db/db.module';
import { devices, interfaceCounterDeltas, interfaceCounterSamples, interfaces, rawTelemetryEvents } from '@db/schema';
import { computeCounterDelta } from './gigawords';
import { NORMALIZER_PARSER_VERSION } from './parser-version';

export type NormalizeResult = { ok: true; note?: string } | { ok: false; reason: string };

function toByteCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

export async function normalizeInterfaceCounterEvent(
  db: DbClient,
  event: typeof rawTelemetryEvents.$inferSelect,
): Promise<NormalizeResult> {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const rxBytes = toByteCount(payload.rx_bytes);
  const txBytes = toByteCount(payload.tx_bytes);
  if (rxBytes === null || txBytes === null) {
    return { ok: false, reason: 'INVALID_COUNTER_PAYLOAD' };
  }

  let interfaceId = event.interfaceId;
  let deviceId = event.deviceId;
  let shipId = event.shipId;

  if (!interfaceId && deviceId && typeof payload.interface_name === 'string') {
    const iface = await db.query.interfaces.findFirst({
      where: and(eq(interfaces.deviceId, deviceId), eq(interfaces.name, payload.interface_name)),
    });
    if (iface) interfaceId = iface.id;
  }
  if (!interfaceId) {
    return { ok: false, reason: 'UNRESOLVED_INTERFACE' };
  }

  const iface = await db.query.interfaces.findFirst({ where: eq(interfaces.id, interfaceId) });
  if (!iface) return { ok: false, reason: 'UNRESOLVED_INTERFACE' };
  deviceId = deviceId ?? iface.deviceId;
  const device = await db.query.devices.findFirst({ where: eq(devices.id, deviceId!) });
  if (!device) return { ok: false, reason: 'UNRESOLVED_DEVICE' };
  shipId = shipId ?? device.shipId;

  const rxPackets = toByteCount(payload.rx_packets);
  const txPackets = toByteCount(payload.tx_packets);
  const rxErrors = toByteCount(payload.rx_errors);
  const txErrors = toByteCount(payload.tx_errors);
  const rxDrops = toByteCount(payload.rx_drops);
  const txDrops = toByteCount(payload.tx_drops);

  const [sample] = await db
    .insert(interfaceCounterSamples)
    .values({
      shipId: shipId!,
      deviceId: deviceId!,
      interfaceId,
      observedAt: event.observedAt,
      rxBytes,
      txBytes,
      rxPackets,
      txPackets,
      rxErrors,
      txErrors,
      rxDrops,
      txDrops,
      counterSource: iface.counterSource,
      rawEventId: event.id,
      parserVersion: NORMALIZER_PARSER_VERSION,
    })
    .onConflictDoNothing({ target: [interfaceCounterSamples.interfaceId, interfaceCounterSamples.observedAt] })
    .returning();

  if (!sample) {
    // Same (interface_id, observed_at) already normalized by a previous ingest — nothing new to do.
    return { ok: true, note: 'SAMPLE_ALREADY_NORMALIZED' };
  }

  const previous = await db.query.interfaceCounterSamples.findFirst({
    where: and(eq(interfaceCounterSamples.interfaceId, interfaceId), lt(interfaceCounterSamples.observedAt, event.observedAt)),
    orderBy: [desc(interfaceCounterSamples.observedAt)],
  });

  if (!previous) {
    // First-ever sample for this interface — nothing to diff against yet.
    return { ok: true, note: 'FIRST_SAMPLE_NO_DELTA' };
  }

  if (iface.counterSource === 'UNRELIABLE') {
    // ADR-10: unreliable counters (no 64-bit HC support) are excluded from reconciliation.
    // We still keep the raw sample (never fabricate/hide raw data) but do not emit a delta.
    return { ok: true, note: 'UNRELIABLE_COUNTER_SOURCE_NO_DELTA' };
  }

  const elapsedSeconds = Math.max(0, (event.observedAt.getTime() - previous.observedAt.getTime()) / 1000);
  const pollIntervalSeconds = device.pollIntervalS;

  const rxDelta = computeCounterDelta({ currentBytes: rxBytes, previousBytes: previous.rxBytes, elapsedSeconds, pollIntervalSeconds });
  const txDelta = computeCounterDelta({ currentBytes: txBytes, previousBytes: previous.txBytes, elapsedSeconds, pollIntervalSeconds });
  const counterReset = rxDelta.counterReset || txDelta.counterReset;
  const quality = rxDelta.quality === 'DEGRADED' || txDelta.quality === 'DEGRADED' ? 'DEGRADED' : 'GOOD';

  const dRxPackets =
    rxPackets !== null && previous.rxPackets !== null && previous.rxPackets !== undefined && !counterReset
      ? Math.max(0, rxPackets - previous.rxPackets)
      : null;
  const dTxPackets =
    txPackets !== null && previous.txPackets !== null && previous.txPackets !== undefined && !counterReset
      ? Math.max(0, txPackets - previous.txPackets)
      : null;

  await db
    .insert(interfaceCounterDeltas)
    .values({
      bucket: event.observedAt,
      shipId: shipId!,
      deviceId: deviceId!,
      interfaceId,
      accountingGroup: iface.accountingGroup,
      dRxBytes: rxDelta.deltaBytes,
      dTxBytes: txDelta.deltaBytes,
      dRxPackets,
      dTxPackets,
      elapsedS: Math.round(elapsedSeconds),
      counterReset,
      quality,
      previousSampleId: previous.id,
      currentSampleId: sample.id,
    })
    .onConflictDoNothing({ target: [interfaceCounterDeltas.interfaceId, interfaceCounterDeltas.bucket] });

  return { ok: true };
}
