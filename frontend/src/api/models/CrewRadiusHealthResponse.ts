/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { ModuleDataQuality } from './ModuleDataQuality';
/**
 * Endpoints are resolved from the service registry, filtered by ship_scope (ADR-04) — never hard-coded. min_required_endpoints is fixed at 2 per SYSTEM_SPEC.
 */
export type CrewRadiusHealthResponse = {
    data?: {
        source?: string;
        units?: Record<string, any>;
        status?: CrewRadiusHealthResponse.status;
        min_required_endpoints?: number;
        configured_endpoints?: number;
        healthy_endpoints?: number;
        ha_compliant?: boolean;
        endpoints?: Array<Record<string, any>>;
        accounting_freshness_seconds?: number | null;
        data_quality?: ModuleDataQuality;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace CrewRadiusHealthResponse {
    export enum status {
        HEALTHY = 'HEALTHY',
        DEGRADED = 'DEGRADED',
        UNHEALTHY = 'UNHEALTHY',
        UNKNOWN = 'UNKNOWN',
    }
}

