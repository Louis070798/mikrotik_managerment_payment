/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { TelemetrySourceHealth } from './TelemetrySourceHealth';
export type TelemetryHealthResponse = {
    data?: {
        status?: TelemetryHealthResponse.status;
        raw_store?: {
            status?: TelemetryHealthResponse.status;
            latest_received_at?: string | null;
        };
        sources?: Array<TelemetrySourceHealth>;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace TelemetryHealthResponse {
    export enum status {
        HEALTHY = 'HEALTHY',
        DEGRADED = 'DEGRADED',
        UNKNOWN = 'UNKNOWN',
    }
}

