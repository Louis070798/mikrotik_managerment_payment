/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { DashboardPeriod } from './DashboardPeriod';
export type CrewRawAccountingResponse = {
    data?: {
        period?: DashboardPeriod;
        units?: Record<string, any>;
        source?: string;
        records?: Array<Record<string, any>>;
    };
    meta?: BaseMeta;
    error?: any;
};

