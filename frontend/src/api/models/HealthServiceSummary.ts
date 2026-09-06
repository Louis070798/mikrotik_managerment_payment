/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthEndpointSummary } from './HealthEndpointSummary';
import type { HealthStatus } from './HealthStatus';
export type HealthServiceSummary = {
    service_name?: string;
    service_type?: HealthServiceSummary.service_type;
    /**
     * Quy tac: tat ca endpoint HEALTHY -> HEALTHY; con it nhat 1 endpoint HEALTHY/DEGRADED dang active -> DEGRADED (da failover, chua UNHEALTHY toan cuc); khong con endpoint nao phuc vu duoc -> UNHEALTHY; tat ca MAINTENANCE -> MAINTENANCE.
     */
    status?: HealthStatus;
    healthy_endpoints?: number;
    total_endpoints?: number;
    active_endpoint?: HealthEndpointSummary | null;
};
export namespace HealthServiceSummary {
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
}

