/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type HealthHaGroup = {
    service_name?: string;
    configured_endpoints?: number;
    healthy_endpoints?: number;
    primary_endpoint_id?: string;
    active_endpoint_id?: string | null;
    failover_state?: HealthHaGroup.failover_state;
    endpoints?: Array<Record<string, any>>;
};
export namespace HealthHaGroup {
    export enum failover_state {
        NORMAL = 'NORMAL',
        FAILED_OVER = 'FAILED_OVER',
        DOWN = 'DOWN',
    }
}

