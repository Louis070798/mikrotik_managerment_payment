/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TelemetrySource } from './TelemetrySource';
export type TelemetryIngestResult = {
    event_id?: string;
    source?: TelemetrySource;
    idempotency_key?: string;
    status?: TelemetryIngestResult.status;
    observed_at?: string;
    /**
     * Outcome of NormalizationService.processEvent() for this event on THIS ingest call. null for DUPLICATE events (already normalized on first ingest, or intentionally not re-run).
     */
    normalized?: boolean | null;
};
export namespace TelemetryIngestResult {
    export enum status {
        ACCEPTED = 'ACCEPTED',
        DUPLICATE = 'DUPLICATE',
    }
}

