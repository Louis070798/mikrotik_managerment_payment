/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { HealthHaGroup } from './HealthHaGroup';
/**
 * Goal #5 HA compliance summary — min 2 RADIUS, min 2 database, collector presence, raw storage presence, backup storage A/B (>=2 distinct storage.backup.* service_names), primary/secondary via failover_state, replication lag/is_primary in database endpoints.details (from service_health_state.details), all sourced from the service registry (ADR-04) — never hard-coded.
 */
export type HealthHaResponse = {
    data?: {
        radius?: {
            min_required?: number;
            configured_endpoints?: number;
            compliant?: boolean;
            groups?: Array<HealthHaGroup>;
        };
        database?: {
            min_required?: number;
            configured_endpoints?: number;
            compliant?: boolean;
            groups?: Array<HealthHaGroup>;
        };
        collector?: {
            configured_endpoints?: number;
            groups?: Array<HealthHaGroup>;
        };
        raw_storage?: {
            configured_endpoints?: number;
            groups?: Array<HealthHaGroup>;
        };
        backup_storage?: {
            min_required_targets?: number;
            configured_targets?: number;
            compliant?: boolean;
            groups?: Array<Record<string, any>>;
        };
    };
    meta?: BaseMeta;
    error?: any;
};

