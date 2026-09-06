/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { DashboardPeriod } from './DashboardPeriod';
import type { ModuleDataQuality } from './ModuleDataQuality';
export type BusinessUsageResponse = {
    data?: {
        period?: DashboardPeriod;
        units?: Record<string, any>;
        source?: string;
        data_status?: BusinessUsageResponse.data_status;
        data_quality?: ModuleDataQuality;
        points?: Array<{
            bucket?: string;
            download_bytes?: number;
            upload_bytes?: number;
            total_bytes?: number;
            counter_resets?: number;
        }>;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace BusinessUsageResponse {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

