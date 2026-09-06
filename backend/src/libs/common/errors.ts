/**
 * Catalog mã lỗi ổn định — khớp docs/backend/03-API_DESIGN.md §1.3 (contracts/errors.yaml).
 * Mã lỗi ổn định dùng chung cho Inventory, Server Health, Dashboard và raw Telemetry.
 */
export interface ErrorCatalogEntry {
  httpStatus: number;
  retryable: boolean;
  retryAfterSeconds?: number;
}

export const ERROR_CATALOG = {
  VALIDATION_FAILED: { httpStatus: 400, retryable: false },
  INVALID_TIME_RANGE: { httpStatus: 400, retryable: false },
  INSUFFICIENT_DATA: { httpStatus: 422, retryable: false },
  RECONCILIATION_UNAVAILABLE: { httpStatus: 422, retryable: false },
  IDEMPOTENCY_KEY_REUSED: { httpStatus: 409, retryable: false },
  TELEMETRY_IDENTITY_CONFLICT: { httpStatus: 422, retryable: false },
  UNAUTHENTICATED: { httpStatus: 401, retryable: false },
  DEVICE_PUSH_UNAUTHORIZED: { httpStatus: 401, retryable: false },
  FORBIDDEN: { httpStatus: 403, retryable: false },
  SCOPE_FORBIDDEN: { httpStatus: 403, retryable: false },
  AREA_NOT_FOUND: { httpStatus: 404, retryable: false },
  SHIP_NOT_FOUND: { httpStatus: 404, retryable: false },
  DEVICE_NOT_FOUND: { httpStatus: 404, retryable: false },
  INTERFACE_NOT_FOUND: { httpStatus: 404, retryable: false },
  ZONE_NOT_FOUND: { httpStatus: 404, retryable: false },
  ENDPOINT_NOT_FOUND: { httpStatus: 404, retryable: false },
  ALERT_NOT_FOUND: { httpStatus: 404, retryable: false },
  SERVICE_NOT_FOUND: { httpStatus: 404, retryable: false },
  TENANT_NOT_FOUND: { httpStatus: 404, retryable: false },
  PACKAGE_NOT_FOUND: { httpStatus: 404, retryable: false },
  SUBSCRIBER_NOT_FOUND: { httpStatus: 404, retryable: false },
  RADIUS_SESSION_NOT_FOUND: { httpStatus: 404, retryable: false },
  RESOURCE_CONFLICT: { httpStatus: 409, retryable: false },
  RADIUS_SESSION_NOT_ACTIVE: { httpStatus: 409, retryable: false },
  AREA_HAS_SHIPS: { httpStatus: 409, retryable: false },
  SHIP_HAS_DEVICES: { httpStatus: 409, retryable: false },
  TENANT_HAS_DEPENDENTS: { httpStatus: 409, retryable: false },
  PACKAGE_IN_USE: { httpStatus: 409, retryable: false },
  DEVICE_PUSH_NOT_CONFIGURED: { httpStatus: 409, retryable: false },
  INTERFACE_DOUBLE_COUNT: { httpStatus: 409, retryable: false },
  LAST_HEALTHY_ENDPOINT: { httpStatus: 409, retryable: false },
  ENDPOINT_ALREADY_EXISTS: { httpStatus: 409, retryable: false },
  ZEROTIER_NOT_CONFIGURED: { httpStatus: 422, retryable: false },
  ZEROTIER_UNREACHABLE: { httpStatus: 503, retryable: true, retryAfterSeconds: 5 },
  ZEROTIER_UPSTREAM_ERROR: { httpStatus: 502, retryable: true, retryAfterSeconds: 5 },
  RADIUS_DISCONNECT_FAILED: { httpStatus: 502, retryable: true, retryAfterSeconds: 5 },
  DATABASE_UNAVAILABLE: { httpStatus: 503, retryable: true, retryAfterSeconds: 5 },
  RATE_LIMITED: { httpStatus: 429, retryable: true, retryAfterSeconds: 10 },
  INTERNAL_ERROR: { httpStatus: 500, retryable: true, retryAfterSeconds: 5 },
} as const satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;
