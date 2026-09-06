/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { CrewUser } from './CrewUser';
import type { DashboardPeriod } from './DashboardPeriod';
import type { IdentityCapability } from './IdentityCapability';
import type { ModuleDataQuality } from './ModuleDataQuality';
export type CrewUsersResponse = {
    data?: {
        period?: DashboardPeriod;
        units?: Record<string, any>;
        source?: string;
        data_status?: CrewUsersResponse.data_status;
        data_quality?: ModuleDataQuality;
        identity_capability?: IdentityCapability;
        service_usage_capability?: Record<string, any>;
        stale_after_seconds?: number;
        /**
         * Compares NetFlow-measured bytes (attributed to a known CREW identity) against RADIUS-reported bytes for the same ship/period — the "billing" anchor per the reference design's coverage check. Null when there is no RADIUS traffic to compare against.
         */
        billing_reconciliation?: {
            netflow_total_bytes?: number | null;
            billing_total_bytes?: number | null;
            coverage_pct?: number | null;
        } | null;
        users?: Array<CrewUser>;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace CrewUsersResponse {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

