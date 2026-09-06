/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DashboardAvailability } from './DashboardAvailability';
import type { DashboardPeriod } from './DashboardPeriod';
import type { DashboardUnits } from './DashboardUnits';
import type { DataQuality } from './DataQuality';
export type ReconciliationItemsData = {
    period?: DashboardPeriod;
    units?: DashboardUnits;
    data_status?: ReconciliationItemsData.data_status;
    availability?: DashboardAvailability;
    items?: Array<Record<string, any>>;
    data_quality?: DataQuality;
};
export namespace ReconciliationItemsData {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        UNAVAILABLE = 'UNAVAILABLE',
    }
}

