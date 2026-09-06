/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { HealthHaResponse } from '../models/HealthHaResponse';
import type { HealthServiceDetail } from '../models/HealthServiceDetail';
import type { HealthServiceSummary } from '../models/HealthServiceSummary';
import type { HealthSummary } from '../models/HealthSummary';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class HealthService {
    /**
     * Tong quan trang thai moi service (RADIUS/database/collector/backup/...)
     * @returns any OK
     * @throws ApiError
     */
    public static getHealthSummary({
        xActorPermissions,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: HealthSummary;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health/summary',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * List trang thai theo tung logical service
     * @returns any OK
     * @throws ApiError
     */
    public static getHealthServices({
        xActorPermissions,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Array<HealthServiceSummary>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health/services',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Chi tiet 1 service, kem tung endpoint
     * @returns any OK
     * @throws ApiError
     */
    public static getHealthServices1({
        serviceName,
        xActorPermissions,
    }: {
        serviceName: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: HealthServiceDetail;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health/services/{serviceName}',
            path: {
                'serviceName': serviceName,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `SERVICE_NOT_FOUND`,
            },
        });
    }
    /**
     * Fleet-wide HA compliance (min-2-RADIUS, min-2-database, backup A/B, failover state)
     * @returns HealthHaResponse HA summary
     * @throws ApiError
     */
    public static getHealthHa({
        xActorPermissions,
    }: {
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<HealthHaResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health/ha',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
            },
        });
    }
}
