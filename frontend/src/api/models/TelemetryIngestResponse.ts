/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { TelemetryIngestResult } from './TelemetryIngestResult';
export type TelemetryIngestResponse = {
    data?: {
        accepted_count?: number;
        duplicate_count?: number;
        events?: Array<TelemetryIngestResult>;
        persistence?: TelemetryIngestResponse.persistence;
        /**
         * true only when EVERY accepted event in this batch was actually normalized into interface_counter_*radius_*ipfix_flow_records (see NormalizationService). Never fabricated as true; a partial or failed normalization leaves this false and the event stays available for POST /telemetry/normalize to retry.
         */
        analytics_processed?: boolean;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace TelemetryIngestResponse {
    export enum persistence {
        RAW_TELEMETRY_EVENTS = 'raw_telemetry_events',
    }
}

