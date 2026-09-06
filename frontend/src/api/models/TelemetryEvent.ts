/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TelemetryIdentity } from './TelemetryIdentity';
import type { TelemetrySource } from './TelemetrySource';
/**
 * Source-specific validation is enforced by the backend: interface counters require interface_name/rx_bytes/tx_bytes; RADIUS requires acct_status_type/acct_session_id; IPFIX requires bytes.
 */
export type TelemetryEvent = {
    source: TelemetrySource;
    idempotency_key: string;
    source_event_id?: string;
    observed_at: string;
    identity?: TelemetryIdentity;
    /**
     * Source-specific raw JSON payload. At least payload or raw_reference is required.
     */
    payload?: Record<string, any>;
    /**
     * Reference to immutable object storage when payload is stored outside the API.
     */
    raw_reference?: string;
    metadata?: Record<string, any>;
};

