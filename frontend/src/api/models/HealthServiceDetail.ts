/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthEndpointSummary } from './HealthEndpointSummary';
import type { HealthServiceSummary } from './HealthServiceSummary';
export type HealthServiceDetail = (HealthServiceSummary & {
    endpoints?: Array<HealthEndpointSummary>;
});

