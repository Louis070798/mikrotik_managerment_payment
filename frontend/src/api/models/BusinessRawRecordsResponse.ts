/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { DashboardPeriod } from './DashboardPeriod';
import type { IdentityCapability } from './IdentityCapability';
export type BusinessRawRecordsResponse = {
    data?: {
        period?: DashboardPeriod;
        units?: Record<string, any>;
        source?: string;
        records?: Array<Record<string, any>>;
        identity_capability?: IdentityCapability;
    };
    meta?: BaseMeta;
    error?: any;
};

