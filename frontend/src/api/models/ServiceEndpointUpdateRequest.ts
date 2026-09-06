/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * reason BAT BUOC -- moi thay doi endpoint di thang vao audit_logs (SYSTEM_SPEC Sec.9.2).
 */
export type ServiceEndpointUpdateRequest = {
    host?: string;
    port?: number;
    protocol?: string;
    priority?: number;
    region?: string | null;
    ship_scope?: Record<string, any>;
    healthcheck_type?: ServiceEndpointUpdateRequest.healthcheck_type;
    healthcheck_interval_s?: number;
    timeout_ms?: number;
    secret_ref?: string | null;
    check_config?: Record<string, any>;
    reason: string;
};
export namespace ServiceEndpointUpdateRequest {
    export enum healthcheck_type {
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

