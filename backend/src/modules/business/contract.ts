export const BUSINESS_UNITS = {
  traffic_bytes: 'bytes',
  data_quality_score: 'ratio',
} as const;

export type DataQualityStatus = 'AVAILABLE' | 'PARTIAL' | 'INSUFFICIENT_DATA';

export type DataQuality = {
  score: number | null;
  status: DataQualityStatus;
  missing_sources: string[];
};

export type IdentityCapability = {
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  method: 'RADIUS' | 'NONE';
  message: string;
};

/**
 * SYSTEM_SPEC §4.3: BUSINESS has no user-level identity by default — there is no 802.1X/PPPoE (or
 * equivalent) auth layer for this zone, and 02-DATABASE_DESIGN.md §9 lists
 * `business_identity_bindings` as an explicitly undecided table. Device-level identity (IP/MAC/
 * VLAN, from the flow record itself) IS available and is not gated by this block.
 */
export function businessIdentityCapability(): IdentityCapability {
  return {
    status: 'NOT_AVAILABLE',
    method: 'NONE',
    message: 'BUSINESS has no per-user authentication mechanism in this system (SYSTEM_SPEC §4.3); only device-level IP/MAC/VLAN identity is available, not username.',
  };
}

// DNS-based classifier hiện đã thật (telemetry-normalize/classifier.ts) — lý do "chưa phân loại
// được" bây giờ là mức flow (xem ipfix_flow_records.unknown_reason), không còn là "chưa xây bộ
// phân loại". Hằng số này giữ cho trường hợp KHÔNG có flow nào khớp DNS trong cả kỳ (ship+period).
export const CLASSIFICATION_NO_DNS_MATCH_REASON = 'NO_DNS_RECORD';
