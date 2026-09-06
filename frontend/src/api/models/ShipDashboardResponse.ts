/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { DashboardAvailability } from './DashboardAvailability';
import type { DashboardPeriod } from './DashboardPeriod';
import type { DashboardUnits } from './DashboardUnits';
import type { DataQuality } from './DataQuality';
import type { ShipDashboardIdentity } from './ShipDashboardIdentity';
export type ShipDashboardResponse = {
    data?: {
        scope?: {
            type?: ShipDashboardResponse.type;
            id?: string;
        };
        ship?: ShipDashboardIdentity;
        period?: DashboardPeriod;
        units?: DashboardUnits;
        data_status?: ShipDashboardResponse.data_status;
        availability?: DashboardAvailability;
        data_quality?: DataQuality;
        connectivity?: Record<string, any>;
        wan?: Array<Record<string, any>>;
        crew?: Record<string, any>;
        business?: Record<string, any>;
        reconciliation_summary?: Record<string, any>;
        alerts?: Record<string, any>;
        status?: string;
        wan_rx?: number | null;
        wan_tx?: number | null;
        active_crew_users?: number | null;
        crew_usage?: number | null;
        business_usage?: number | null;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace ShipDashboardResponse {
    export enum type {
        SHIP = 'SHIP',
    }
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

