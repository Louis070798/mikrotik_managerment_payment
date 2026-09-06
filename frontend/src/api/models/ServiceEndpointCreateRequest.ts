/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ServiceEndpointCreateRequest = {
    service_type: ServiceEndpointCreateRequest.service_type;
    environment?: string;
    host: string;
    port: number;
    protocol: string;
    priority?: number;
    region?: string | null;
    ship_scope?: Record<string, any>;
    healthcheck_type: ServiceEndpointCreateRequest.healthcheck_type;
    healthcheck_interval_s?: number;
    timeout_ms?: number;
    /**
     * Tham chieu secret, vd 'env:RADIUS_PROD_SECRET' (dev resolver). KHONG BAO GIO gia tri secret that.
     */
    secret_ref?: string | null;
    check_config?: Record<string, any>;
    enabled?: boolean;
};
export namespace ServiceEndpointCreateRequest {
    export enum service_type {
        RADIUS = 'RADIUS',
        RADIUS_ACCT = 'RADIUS_ACCT',
        DATABASE = 'DATABASE',
        COLLECTOR = 'COLLECTOR',
        STORAGE = 'STORAGE',
        USER_MANAGER = 'USER_MANAGER',
        CONTROLLER = 'CONTROLLER',
        BUS = 'BUS',
        CACHE = 'CACHE',
        ZEROTIER = 'ZEROTIER',
    }
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

