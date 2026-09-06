/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type DashboardAvailability = {
    status: DashboardAvailability.status;
    code: DashboardAvailability.code | null;
    message?: string | null;
    missing_sources: Array<string>;
};
export namespace DashboardAvailability {
    export enum status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
        UNAVAILABLE = 'UNAVAILABLE',
    }
    export enum code {
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
        RECONCILIATION_UNAVAILABLE = 'RECONCILIATION_UNAVAILABLE',
        IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED',
        TELEMETRY_IDENTITY_CONFLICT = 'TELEMETRY_IDENTITY_CONFLICT',
    }
}

