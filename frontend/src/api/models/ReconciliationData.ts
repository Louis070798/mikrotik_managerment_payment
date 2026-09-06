/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DashboardAvailability } from './DashboardAvailability';
import type { DashboardPeriod } from './DashboardPeriod';
import type { DashboardUnits } from './DashboardUnits';
import type { DataQuality } from './DataQuality';
import type { ReconciliationGaps } from './ReconciliationGaps';
export type ReconciliationData = {
    period?: DashboardPeriod;
    units?: DashboardUnits;
    data_status?: ReconciliationData.data_status;
    availability?: DashboardAvailability;
    wan?: Record<string, any> | null;
    crew?: Record<string, any> | null;
    business?: Record<string, any> | null;
    management?: Record<string, any> | null;
    gaps?: ReconciliationGaps;
    gap_reasons?: Array<Record<string, any>>;
    unattributed_bytes?: number | null;
    data_quality?: DataQuality;
    formula_version?: string;
};
export namespace ReconciliationData {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        UNAVAILABLE = 'UNAVAILABLE',
    }
}

