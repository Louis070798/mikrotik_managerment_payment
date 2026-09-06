import { and, eq, isNull, sql } from 'drizzle-orm';
import { DbClient } from '@db/db.module';
import { identityBindings, radiusAccountingEvents, radiusSessions, rawTelemetryEvents, subscribers } from '@db/schema';
import { combineOctets } from './gigawords';
import { NORMALIZER_PARSER_VERSION } from './parser-version';

export type NormalizeResult = { ok: true; note?: string } | { ok: false; reason: string };

function toGigawords(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function toOctets(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

/**
 * Payload shape this normalizer understands for RADIUS_ACCOUNTING telemetry events.
 * Required by dto.ts: acct_status_type, acct_session_id. Everything else here is optional and,
 * per ADR-09, `acct_input_*` = user UPLOAD (NAS perspective), `acct_output_*` = user DOWNLOAD.
 */
type RadiusPayload = {
  acct_status_type: 'START' | 'INTERIM_UPDATE' | 'STOP' | 'ON';
  acct_session_id: string;
  username?: string;
  framed_ip?: string;
  calling_station_mac?: string;
  acct_input_octets?: unknown;
  acct_input_gigawords?: unknown;
  acct_output_octets?: unknown;
  acct_output_gigawords?: unknown;
  acct_session_time?: unknown;
  acct_terminate_cause?: string;
};

async function openRadiusBinding(
  db: DbClient,
  params: { shipId: string; framedIp: string; username: string; deviceId: string | null; interfaceId: string | null; acctSessionId: string; observedAt: Date },
) {
  // Close any prior open interval for this (ship, ip, RADIUS) before opening a new one — required
  // by the GiST EXCLUDE constraint (ADR-12: no two RADIUS bindings on the same IP may overlap).
  await db
    .update(identityBindings)
    .set({ validTo: params.observedAt })
    .where(
      and(
        eq(identityBindings.shipId, params.shipId),
        eq(identityBindings.clientIp, params.framedIp),
        eq(identityBindings.source, 'RADIUS'),
        isNull(identityBindings.validTo),
      ),
    );

  await db.insert(identityBindings).values({
    shipId: params.shipId,
    validFrom: params.observedAt,
    validTo: null,
    clientIp: params.framedIp,
    zone: 'CREW', // RADIUS/HotSpot auth in this system is CREW-only (SYSTEM_SPEC §4.3)
    username: params.username,
    deviceId: params.deviceId,
    interfaceId: params.interfaceId,
    acctSessionId: params.acctSessionId,
    source: 'RADIUS',
    confidence: '0.95',
  });
}

async function closeRadiusBinding(db: DbClient, params: { shipId: string; framedIp: string; acctSessionId: string; observedAt: Date }) {
  await db
    .update(identityBindings)
    .set({ validTo: params.observedAt })
    .where(
      and(
        eq(identityBindings.shipId, params.shipId),
        eq(identityBindings.clientIp, params.framedIp),
        eq(identityBindings.source, 'RADIUS'),
        eq(identityBindings.acctSessionId, params.acctSessionId),
        isNull(identityBindings.validTo),
      ),
    );
}

export async function normalizeRadiusAccountingEvent(
  db: DbClient,
  event: typeof rawTelemetryEvents.$inferSelect,
): Promise<NormalizeResult> {
  const payload = (event.payload ?? {}) as RadiusPayload;
  if (!payload.acct_status_type || !payload.acct_session_id) {
    return { ok: false, reason: 'INVALID_ACCOUNTING_PAYLOAD' };
  }

  const inputOctets = toOctets(payload.acct_input_octets);
  const inputGigawords = toGigawords(payload.acct_input_gigawords);
  const outputOctets = toOctets(payload.acct_output_octets);
  const outputGigawords = toGigawords(payload.acct_output_gigawords);
  const uploadBytes = combineOctets(inputOctets, inputGigawords); // Acct-Input = user upload
  const downloadBytes = combineOctets(outputOctets, outputGigawords); // Acct-Output = user download
  const sessionTimeS = toOctets(payload.acct_session_time);
  const username = event.userIdentity ?? (typeof payload.username === 'string' ? payload.username : null);
  const framedIp = typeof payload.framed_ip === 'string' ? payload.framed_ip : null;
  const callingStationMac = typeof payload.calling_station_mac === 'string' ? payload.calling_station_mac : null;

  await db.insert(radiusAccountingEvents).values({
    shipId: event.shipId,
    deviceId: event.deviceId,
    acctSessionId: payload.acct_session_id,
    acctStatusType: payload.acct_status_type,
    username,
    framedIp,
    callingStationMac,
    acctInputOctets: inputOctets,
    acctInputGigawords: inputGigawords,
    acctOutputOctets: outputOctets,
    acctOutputGigawords: outputGigawords,
    uploadBytes,
    downloadBytes,
    sessionTimeS,
    terminateCause: payload.acct_terminate_cause ?? null,
    observedAt: event.observedAt,
    rawEventId: event.id,
    parserVersion: NORMALIZER_PARSER_VERSION,
  });

  if (!event.shipId) {
    return { ok: true, note: 'RAW_ACCOUNTING_STORED_NO_SHIP_NO_SESSION' };
  }
  const shipId = event.shipId;

  if (payload.acct_status_type === 'ON') {
    // NAS reboot marker — no session-level state change.
    return { ok: true, note: 'NAS_REBOOT_MARKER' };
  }

  if (!username) {
    return { ok: true, note: 'RAW_ACCOUNTING_STORED_NO_USERNAME_NO_SESSION' };
  }

  const existing = await db.query.radiusSessions.findFirst({
    where: and(eq(radiusSessions.shipId, shipId), eq(radiusSessions.acctSessionId, payload.acct_session_id)),
  });

  if (payload.acct_status_type === 'START') {
    if (!existing) {
      await db.insert(radiusSessions).values({
        shipId,
        deviceId: event.deviceId,
        username,
        acctSessionId: payload.acct_session_id,
        framedIp,
        callingStationMac,
        startTime: event.observedAt,
        status: 'ACTIVE',
      });
    }
    if (framedIp) {
      await openRadiusBinding(db, {
        shipId,
        framedIp,
        username,
        deviceId: event.deviceId,
        interfaceId: event.interfaceId,
        acctSessionId: payload.acct_session_id,
        observedAt: event.observedAt,
      });
    }
    return { ok: true };
  }

  if (payload.acct_status_type === 'INTERIM_UPDATE') {
    if (existing) {
      if (existing.status === 'ACTIVE') {
        await db
          .update(radiusSessions)
          .set({ uploadBytes, downloadBytes, sessionTimeS, lastInterimAt: event.observedAt, framedIp: framedIp ?? existing.framedIp, updatedAt: new Date() })
          .where(eq(radiusSessions.id, existing.id));
      }
    } else {
      // Missed Start — best-effort session creation from the first Interim we see.
      await db.insert(radiusSessions).values({
        shipId,
        deviceId: event.deviceId,
        username,
        acctSessionId: payload.acct_session_id,
        framedIp,
        callingStationMac,
        startTime: event.observedAt,
        lastInterimAt: event.observedAt,
        uploadBytes,
        downloadBytes,
        sessionTimeS,
        status: 'ACTIVE',
      });
      if (framedIp) {
        await openRadiusBinding(db, {
          shipId,
          framedIp,
          username,
          deviceId: event.deviceId,
          interfaceId: event.interfaceId,
          acctSessionId: payload.acct_session_id,
          observedAt: event.observedAt,
        });
      }
    }
    return { ok: true };
  }

  // STOP
  const finalUploadBytes = existing ? uploadBytes ?? existing.uploadBytes : uploadBytes;
  const finalDownloadBytes = existing ? downloadBytes ?? existing.downloadBytes : downloadBytes;
  if (existing) {
    await db
      .update(radiusSessions)
      .set({
        stopTime: event.observedAt,
        uploadBytes: finalUploadBytes,
        downloadBytes: finalDownloadBytes,
        sessionTimeS: sessionTimeS ?? existing.sessionTimeS,
        terminateCause: payload.acct_terminate_cause ?? existing.terminateCause,
        status: 'CLOSED',
        updatedAt: new Date(),
      })
      .where(eq(radiusSessions.id, existing.id));
  } else {
    // Stop with no matching Start/Interim ever seen — recorded as ORPHANED (design doc §3.3).
    await db.insert(radiusSessions).values({
      shipId,
      deviceId: event.deviceId,
      username,
      acctSessionId: payload.acct_session_id,
      framedIp,
      callingStationMac,
      startTime: event.observedAt,
      stopTime: event.observedAt,
      uploadBytes,
      downloadBytes,
      sessionTimeS,
      terminateCause: payload.acct_terminate_cause ?? null,
      status: 'ORPHANED',
    });
  }
  if (framedIp) {
    await closeRadiusBinding(db, { shipId, framedIp, acctSessionId: payload.acct_session_id, observedAt: event.observedAt });
  }

  // Cộng dồn quota thật cho subscriber khớp (nas_device_id, username) — subscribers.quota_used_bytes
  // trước đây không bao giờ được ghi (luôn 0), khiến kiểm tra quota ở Access-Request luôn vô nghĩa.
  // Cộng bằng SQL increment (không phải read-modify-write) để tránh race giữa các STOP đồng thời.
  const sessionBytesTotal = (finalUploadBytes ?? 0) + (finalDownloadBytes ?? 0);
  if (event.deviceId && username && sessionBytesTotal > 0) {
    await db
      .update(subscribers)
      .set({ quotaUsedBytes: sql`${subscribers.quotaUsedBytes} + ${sessionBytesTotal}`, updatedAt: new Date() })
      .where(and(eq(subscribers.nasDeviceId, event.deviceId), eq(subscribers.username, username), isNull(subscribers.deletedAt)));
  }

  return { ok: true };
}
