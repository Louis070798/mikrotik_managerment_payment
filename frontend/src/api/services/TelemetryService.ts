/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TelemetryHealthResponse } from '../models/TelemetryHealthResponse';
import type { TelemetryIngestRequest } from '../models/TelemetryIngestRequest';
import type { TelemetryIngestResponse } from '../models/TelemetryIngestResponse';
import type { TelemetryNormalizeResponse } from '../models/TelemetryNormalizeResponse';
import type { TelemetrySource } from '../models/TelemetrySource';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class TelemetryService {
    /**
     * Persist a batch of raw telemetry events
     * Persists raw interface counters, RADIUS accounting or IPFIX flow events in the raw inbox. This endpoint does not claim that a RouterOS collector is connected and does not run analytics.
     * @returns TelemetryIngestResponse Events persisted or acknowledged as idempotent duplicates
     * @throws ApiError
     */
    public static postTelemetryIngest({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: TelemetryIngestRequest,
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<TelemetryIngestResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/telemetry/ingest',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid telemetry payload`,
                403: `FORBIDDEN`,
                409: `IDEMPOTENCY_KEY_REUSED`,
                422: `TELEMETRY_IDENTITY_CONFLICT`,
            },
        });
    }
    /**
     * Raw telemetry ingest health
     * Shows raw inbox persistence and last received time per source. UNKNOWN means no event has been ingested yet.
     * @returns TelemetryHealthResponse Telemetry persistence health
     * @throws ApiError
     */
    public static getTelemetryHealth({
        xActorPermissions,
    }: {
        xActorPermissions?: string,
    }): CancelablePromise<TelemetryHealthResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/telemetry/health',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
            },
        });
    }
    /**
     * Manually catch up / reprocess pending raw telemetry normalization
     * Stand-in for the NATS consumer worker described in ADR-03 (not implemented in this phase — see docs/backend/02-DATABASE_DESIGN.md §8). Ingest already normalizes synchronously; this retries anything left with processed_at IS NULL.
     * @returns TelemetryNormalizeResponse Normalization sweep result
     * @throws ApiError
     */
    public static postTelemetryNormalize({
        limit = 200,
        source,
        xActorPermissions,
    }: {
        limit?: number,
        source?: TelemetrySource,
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<TelemetryNormalizeResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/telemetry/normalize',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'limit': limit,
                'source': source,
            },
            errors: {
                403: `FORBIDDEN`,
            },
        });
    }
}
