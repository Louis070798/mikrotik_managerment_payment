/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { DashboardAvailability } from './DashboardAvailability';
import type { DashboardPeriod } from './DashboardPeriod';
import type { DashboardTrafficSummary } from './DashboardTrafficSummary';
import type { DashboardUnits } from './DashboardUnits';
import type { DataQuality } from './DataQuality';
export type GlobalDashboardResponse = {
    data?: {
        scope?: {
            type?: GlobalDashboardResponse.type;
        };
        period?: DashboardPeriod;
        units?: DashboardUnits;
        data_status?: GlobalDashboardResponse.data_status;
        availability?: DashboardAvailability;
        data_quality?: DataQuality;
        total_areas?: number;
        total_ships?: number;
        total_devices?: number;
        online_ships?: number;
        total_wan_throughput?: number | null;
        active_crew_users?: number | null;
        degraded_ships?: number;
        offline_ships?: number;
        traffic?: DashboardTrafficSummary;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace GlobalDashboardResponse {
    export enum type {
        GLOBAL = 'GLOBAL',
    }
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

