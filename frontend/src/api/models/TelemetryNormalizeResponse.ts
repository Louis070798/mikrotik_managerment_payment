/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Manual catch-up/reprocess trigger — stand-in for the NATS consumer worker (ADR-03). Ingest already normalizes synchronously; this is for events left pending after a transient failure.
 */
export type TelemetryNormalizeResponse = {
    data?: {
        scanned?: number;
        normalized?: number;
        failed?: number;
        details?: Array<{
            id?: string;
            ok?: boolean;
            note?: string | null;
        }>;
    };
    meta?: Record<string, any>;
    error?: any;
};

