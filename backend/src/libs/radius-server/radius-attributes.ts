/**
 * RFC 2865/2866 — hằng số cần cho RADIUS ACCOUNTING server thật (UDP). Chỉ khai báo những gì
 * dùng tới; không copy nguyên bảng attribute type của RFC.
 */

export const RADIUS_CODE = {
  ACCESS_REQUEST: 1,
  ACCESS_ACCEPT: 2,
  ACCESS_REJECT: 3,
  ACCOUNTING_REQUEST: 4,
  ACCOUNTING_RESPONSE: 5,
  // RFC 5176 §3 — CoA/Disconnect (dùng ở chiều CLIENT, xem libs/radius-coa/).
  DISCONNECT_REQUEST: 40,
  DISCONNECT_ACK: 41,
  DISCONNECT_NAK: 42,
  COA_REQUEST: 43,
  COA_ACK: 44,
  COA_NAK: 45,
} as const;

export const RADIUS_ATTR = {
  USER_NAME: 1,
  USER_PASSWORD: 2,
  NAS_IP_ADDRESS: 4,
  NAS_PORT: 5,
  FRAMED_IP_ADDRESS: 8,
  CALLING_STATION_ID: 31,
  ACCT_STATUS_TYPE: 40,
  ACCT_DELAY_TIME: 41,
  ACCT_INPUT_OCTETS: 42,
  ACCT_OUTPUT_OCTETS: 43,
  ACCT_SESSION_ID: 44,
  ACCT_AUTHENTIC: 45,
  ACCT_SESSION_TIME: 46,
  ACCT_TERMINATE_CAUSE: 49,
  ACCT_INPUT_GIGAWORDS: 52,
  ACCT_OUTPUT_GIGAWORDS: 53,
} as const;

/**
 * RFC 2866 §5.1. Chỉ map các giá trị mà telemetry/dto.ts's acct_status_type enum chấp nhận
 * (START/INTERIM_UPDATE/STOP/ON) — Accounting-Off (8) và mọi giá trị lạ trả về undefined, caller
 * phải tự quyết định (ack gói nhưng không forward vào ingest, không tự bịa ra 1 trạng thái khác).
 */
export function acctStatusTypeName(code: number): 'START' | 'INTERIM_UPDATE' | 'STOP' | 'ON' | undefined {
  switch (code) {
    case 1:
      return 'START';
    case 2:
      return 'STOP';
    case 3:
      return 'INTERIM_UPDATE';
    case 7:
      return 'ON';
    default:
      return undefined;
  }
}
