/**
 * Shared response-shape helpers for the CREW module. Mirrors the "honest unavailability" pattern
 * established in modules/dashboard/dashboard.contract.ts (never fabricate a number, always carry
 * period/units/source/freshness/warnings/data_quality per the phase mandate) — reimplemented here
 * rather than imported, because modules/* must not import modules/* (01-BACKEND_DESIGN.md §3).
 */

export const CREW_UNITS = {
  traffic_bytes: 'bytes',
  data_quality_score: 'ratio',
} as const;

export type DataQualityStatus = 'AVAILABLE' | 'PARTIAL' | 'INSUFFICIENT_DATA';

export type DataQuality = {
  score: number | null;
  status: DataQualityStatus;
  missing_sources: string[];
  radius_ha_below_minimum: boolean;
};

export type IdentityCapability = {
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  method: 'RADIUS' | 'NONE';
  message: string;
};

export function crewIdentityCapability(): IdentityCapability {
  return {
    status: 'AVAILABLE',
    method: 'RADIUS',
    message: 'CREW user identity is derived from RADIUS accounting (Framed-IP-Address + Calling-Station-Id), per ADR-12.',
  };
}

export type ServiceUsageCapability =
  | { status: 'AVAILABLE'; method: 'DNS'; message: string }
  | { status: 'NOT_AVAILABLE'; reason: 'NO_CLASSIFIED_FLOWS_IN_PERIOD'; message: string };

/**
 * Real DNS-based classifier now exists (telemetry-normalize/classifier.ts, tầng 1/2 theo
 * dns-resolution-cache) — AVAILABLE khi có ít nhất 1 flow đã gắn app trong ship+period này.
 * NOT_AVAILABLE ở đây có nghĩa là "chưa có flow nào phân loại được trong kỳ này" (chưa cấu hình
 * NetFlow/DNS log trên router, hoặc chưa có traffic khớp DNS log) — không còn là "chưa xây".
 */
export function serviceUsageCapability(hasClassifiedFlows: boolean): ServiceUsageCapability {
  if (hasClassifiedFlows) {
    return { status: 'AVAILABLE', method: 'DNS', message: 'Service/domain usage is derived from DNS log correlation against NetFlow v9 flows (see ipfix_flow_records.classification_method=DNS).' };
  }
  return {
    status: 'NOT_AVAILABLE',
    reason: 'NO_CLASSIFIED_FLOWS_IN_PERIOD',
    message: 'No DNS-classified NetFlow records were found for this ship in the requested period — either NetFlow/DNS log is not configured on the router yet, or no traffic matched a DNS record.',
  };
}

/**
 * A RADIUS session with no Interim-Update for longer than this is displayed as STALE even though
 * its stored status is still ACTIVE (SYSTEM_SPEC §7.7 "user chưa gửi accounting"). There is no
 * background sweep job in this phase (see phase report), so this is computed at read time from a
 * fixed assumption rather than a per-NAS configured interim interval, which is a documented gap.
 */
export const STALE_AFTER_SECONDS = 900;

export function displaySessionStatus(status: string, lastActivityAt: Date | null, now: Date): string {
  if (status !== 'ACTIVE' || !lastActivityAt) return status;
  const ageSeconds = (now.getTime() - lastActivityAt.getTime()) / 1000;
  return ageSeconds > STALE_AFTER_SECONDS ? 'STALE' : 'ACTIVE';
}
