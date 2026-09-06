/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AreaDashboardShip } from './AreaDashboardShip';
import type { BaseMeta } from './BaseMeta';
import type { DashboardAvailability } from './DashboardAvailability';
import type { DashboardPeriod } from './DashboardPeriod';
import type { DashboardTrafficSummary } from './DashboardTrafficSummary';
import type { DashboardUnits } from './DashboardUnits';
import type { DataQuality } from './DataQuality';
export type AreaDashboardResponse = {
    data?: {
        scope?: Record<string, any>;
        area?: Record<string, any>;
        period?: DashboardPeriod;
        units?: DashboardUnits;
        data_status?: AreaDashboardResponse.data_status;
        availability?: DashboardAvailability;
        data_quality?: DataQuality;
        inventory?: Record<string, any>;
        ships?: Array<AreaDashboardShip>;
        traffic?: DashboardTrafficSummary;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace AreaDashboardResponse {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

