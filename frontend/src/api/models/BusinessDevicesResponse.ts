/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { BusinessDevice } from './BusinessDevice';
import type { DashboardPeriod } from './DashboardPeriod';
import type { IdentityCapability } from './IdentityCapability';
import type { ModuleDataQuality } from './ModuleDataQuality';
export type BusinessDevicesResponse = {
    data?: {
        period?: DashboardPeriod;
        units?: Record<string, any>;
        source?: string;
        data_status?: BusinessDevicesResponse.data_status;
        data_quality?: ModuleDataQuality;
        identity_capability?: IdentityCapability;
        top_device?: BusinessDevice | null;
        devices?: Array<BusinessDevice>;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace BusinessDevicesResponse {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

