/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthStatus } from './HealthStatus';
export type HealthEndpointSummary = {
    id?: string;
    label?: string;
    host?: string;
    port?: number;
    priority?: number;
    status?: HealthStatus;
    is_active?: boolean;
    last_check_at?: string | null;
    last_success_at?: string | null;
    rtt_ms?: number | null;
    failure_count?: number;
    breaker_state?: HealthEndpointSummary.breaker_state;
    last_error?: Record<string, any> | null;
    /**
     * Loai check THAT da chay -- vd RADIUS gui Access-Request that, SQL_RW chay ca read+write.
     */
    check?: {
        type?: HealthEndpointSummary.type;
    };
};
export namespace HealthEndpointSummary {
    export enum breaker_state {
        CLOSED = 'CLOSED',
        OPEN = 'OPEN',
        HALF_OPEN = 'HALF_OPEN',
    }
    export enum type {
        RADIUS_ACCESS_REQUEST = 'RADIUS_ACCESS_REQUEST',
        RADIUS_ACCT_PROBE = 'RADIUS_ACCT_PROBE',
        SQL_RW = 'SQL_RW',
        CLICKHOUSE_PING = 'CLICKHOUSE_PING',
        FLOW_RECENCY = 'FLOW_RECENCY',
        POLL_RECENCY = 'POLL_RECENCY',
        S3_RW = 'S3_RW',
        HTTP_FUNCTIONAL = 'HTTP_FUNCTIONAL',
        NATS_RTT = 'NATS_RTT',
        BACKUP_FRESHNESS = 'BACKUP_FRESHNESS',
    }
}

