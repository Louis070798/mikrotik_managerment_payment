/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Body loi chuan hoa -- AGENT_COLLABORATION.md Sec.5. Khong bao gio chua stack trace hay loi driver that.
 */
export type ErrorDetails = {
    code: ErrorDetails.code;
    message: string;
    details?: Record<string, any> | null;
    retryable: boolean;
    retry_after_seconds?: number | null;
};
export namespace ErrorDetails {
    export enum code {
        VALIDATION_FAILED = 'VALIDATION_FAILED',
        INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
        RECONCILIATION_UNAVAILABLE = 'RECONCILIATION_UNAVAILABLE',
        UNAUTHENTICATED = 'UNAUTHENTICATED',
        FORBIDDEN = 'FORBIDDEN',
        SCOPE_FORBIDDEN = 'SCOPE_FORBIDDEN',
        AREA_NOT_FOUND = 'AREA_NOT_FOUND',
        SHIP_NOT_FOUND = 'SHIP_NOT_FOUND',
        DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
        INTERFACE_NOT_FOUND = 'INTERFACE_NOT_FOUND',
        ZONE_NOT_FOUND = 'ZONE_NOT_FOUND',
        ENDPOINT_NOT_FOUND = 'ENDPOINT_NOT_FOUND',
        ALERT_NOT_FOUND = 'ALERT_NOT_FOUND',
        SERVICE_NOT_FOUND = 'SERVICE_NOT_FOUND',
        RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
        AREA_HAS_SHIPS = 'AREA_HAS_SHIPS',
        SHIP_HAS_DEVICES = 'SHIP_HAS_DEVICES',
        INTERFACE_DOUBLE_COUNT = 'INTERFACE_DOUBLE_COUNT',
        LAST_HEALTHY_ENDPOINT = 'LAST_HEALTHY_ENDPOINT',
        ENDPOINT_ALREADY_EXISTS = 'ENDPOINT_ALREADY_EXISTS',
        DATABASE_UNAVAILABLE = 'DATABASE_UNAVAILABLE',
        RATE_LIMITED = 'RATE_LIMITED',
        INTERNAL_ERROR = 'INTERNAL_ERROR',
    }
}

