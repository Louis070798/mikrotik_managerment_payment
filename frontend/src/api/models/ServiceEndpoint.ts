/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthStatus } from './HealthStatus';
/**
 * Mot dia chi (host/port) cu the cua mot service logic (service_name). Day la nguon su that DUY NHAT cho dia chi RADIUS/database/collector/... -- ServiceRegistry doc tu bang nay, khong co code nao duoc phep hard-code IP (ADR-04). secret KHONG BAO GIO xuat hien trong response, chi co secret_ref (tham chieu) va secret_configured (boolean).
 */
export type ServiceEndpoint = {
    id?: string;
    /**
     * Ten service logic, vd 'radius-primary'
     */
    service_name?: string;
    service_type?: ServiceEndpoint.service_type;
    environment?: string;
    host?: string;
    port?: number;
    protocol?: string;
    /**
     * So nho hon = uu tien cao hon khi chon active endpoint
     */
    priority?: number;
    enabled?: boolean;
    region?: string | null;
    ship_scope?: Record<string, any>;
    healthcheck_type?: ServiceEndpoint.healthcheck_type;
    healthcheck_interval_s?: number;
    timeout_ms?: number;
    /**
     * true neu secret_ref resolve duoc -- KHONG BAO GIO tra secret that
     */
    secret_configured?: boolean;
    /**
     * Tham so rieng cho tung loai checker (vd probe_username, database, path)
     */
    check_config?: Record<string, any>;
    in_maintenance?: boolean;
    /**
     * Tang moi lan PATCH -- doi chieu voi revisions[]
     */
    config_version?: number;
    status?: HealthStatus;
    /**
     * Endpoint dang duoc chon phuc vu (uu tien cao nhat con HEALTHY/DEGRADED)
     */
    is_active?: boolean;
    last_check_at?: string | null;
    last_success_at?: string | null;
    last_rtt_ms?: number | null;
    failure_count?: number;
    breaker_state?: ServiceEndpoint.breaker_state;
    last_error?: Record<string, any> | null;
    created_at?: string;
    updated_at?: string;
};
export namespace ServiceEndpoint {
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
    export enum breaker_state {
        CLOSED = 'CLOSED',
        OPEN = 'OPEN',
        HALF_OPEN = 'HALF_OPEN',
    }
}

