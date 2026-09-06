/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Ban/cap nhat idempotent qua fingerprint (partial unique index WHERE status IN (FIRING,ACKED)) -- endpoint unhealthy lien tuc khong tao alert spam, chi cap nhat evidence cua alert dang mo.
 */
export type Alert = {
    id?: string;
    kind?: Alert.kind;
    status?: Alert.status;
    severity?: Alert.severity;
    scope?: Record<string, any>;
    title?: string;
    summary?: string | null;
    evidence?: Record<string, any> | null;
    started_at?: string;
    acked_by?: string | null;
    acked_at?: string | null;
    resolved_at?: string | null;
    resolve_reason?: string | null;
};
export namespace Alert {
    export enum kind {
        DEVICE_DOWN = 'DEVICE_DOWN',
        WAN_DOWN = 'WAN_DOWN',
        VPN_DOWN = 'VPN_DOWN',
        RADIUS_FAILURE = 'RADIUS_FAILURE',
        DATABASE_FAILURE = 'DATABASE_FAILURE',
        COLLECTOR_DELAYED = 'COLLECTOR_DELAYED',
        BACKUP_OVERDUE = 'BACKUP_OVERDUE',
        BACKUP_SIZE_ANOMALY = 'BACKUP_SIZE_ANOMALY',
        ENDPOINT_UNHEALTHY = 'ENDPOINT_UNHEALTHY',
    }
    export enum status {
        FIRING = 'FIRING',
        ACKED = 'ACKED',
        RESOLVED = 'RESOLVED',
    }
    export enum severity {
        INFO = 'INFO',
        WARNING = 'WARNING',
        MAJOR = 'MAJOR',
        CRITICAL = 'CRITICAL',
    }
}

