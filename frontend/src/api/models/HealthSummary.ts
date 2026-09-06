/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthServiceSummary } from './HealthServiceSummary';
import type { HealthStatus } from './HealthStatus';
export type HealthSummary = {
    overall?: HealthStatus;
    services?: Array<HealthServiceSummary>;
};

