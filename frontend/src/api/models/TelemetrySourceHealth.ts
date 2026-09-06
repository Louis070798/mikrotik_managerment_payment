/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TelemetrySource } from './TelemetrySource';
export type TelemetrySourceHealth = {
    source?: TelemetrySource;
    status?: TelemetrySourceHealth.status;
    event_count?: number;
    last_received_at?: string | null;
    freshness_seconds?: number | null;
};
export namespace TelemetrySourceHealth {
    export enum status {
        HEALTHY = 'HEALTHY',
        DEGRADED = 'DEGRADED',
        UNKNOWN = 'UNKNOWN',
    }
}

