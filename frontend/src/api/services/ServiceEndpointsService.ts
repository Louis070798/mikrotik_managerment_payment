/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { MaintenanceRequest } from '../models/MaintenanceRequest';
import type { ServiceEndpoint } from '../models/ServiceEndpoint';
import type { ServiceEndpointCreateRequest } from '../models/ServiceEndpointCreateRequest';
import type { ServiceEndpointRevision } from '../models/ServiceEndpointRevision';
import type { ServiceEndpointUpdateRequest } from '../models/ServiceEndpointUpdateRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ServiceEndpointsService {
    /**
     * List ten cac logical service dang co endpoint
     * @returns any OK
     * @throws ApiError
     */
    public static getServices({
        xActorPermissions,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Array<string>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/services',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Tao endpoint moi cho mot service (KHONG rollout -- chi tao record + dang ky vao registry)
     * @returns any Created
     * @throws ApiError
     */
    public static postServicesEndpoints({
        serviceName,
        requestBody,
        xActorPermissions,
    }: {
        serviceName: string,
        requestBody: ServiceEndpointCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ServiceEndpoint;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/services/{serviceName}/endpoints',
            path: {
                'serviceName': serviceName,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * List service endpoints (loc service_name/environment/enabled)
     * @returns any OK
     * @throws ApiError
     */
    public static getServiceEndpoints({
        xActorPermissions,
        serviceName,
        environment,
        enabled,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        serviceName?: string,
        environment?: string,
        enabled?: 'true' | 'false',
    }): CancelablePromise<{
        data?: Array<ServiceEndpoint>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/service-endpoints',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'service_name': serviceName,
                'environment': environment,
                'enabled': enabled,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Get service endpoint detail (secret_configured, khong bao gio secret that)
     * @returns any OK
     * @throws ApiError
     */
    public static getServiceEndpoints1({
        id,
        xActorPermissions,
    }: {
        id: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ServiceEndpoint;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/service-endpoints/{id}',
            path: {
                'id': id,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Cap nhat endpoint -- hot-reload ServiceRegistry ngay (khong can restart), sinh revision moi
     * @returns any Updated
     * @throws ApiError
     */
    public static patchServiceEndpoints({
        id,
        requestBody,
        xActorPermissions,
    }: {
        id: string,
        requestBody: ServiceEndpointUpdateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ServiceEndpoint;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/service-endpoints/{id}',
            path: {
                'id': id,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Xoa endpoint (soft delete). Chan neu la endpoint HEALTHY cuoi cung cua service.
     * @returns void
     * @throws ApiError
     */
    public static deleteServiceEndpoints({
        id,
        xActorPermissions,
    }: {
        id: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/service-endpoints/{id}',
            path: {
                'id': id,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
                409: `LAST_HEALTHY_ENDPOINT -- day la endpoint HEALTHY cuoi cung, khong the tu cat chan minh`,
            },
        });
    }
    /**
     * Chay synthetic health check ngay lap tuc (khong doi den chu ky sweep)
     * Ap dung retry (exponential backoff + jitter) + timeout tren tung attempt + circuit breaker (CLOSED/OPEN/HALF_OPEN) truoc khi cap nhat trang thai. Neu ket qua la UNHEALTHY se ban/cap nhat alert tuong ung (Sec Alerts) va ghi audit_log.
     * @returns any Ket qua check (real functional check, khong chi TCP port)
     * @throws ApiError
     */
    public static postServiceEndpointsCheck({
        id,
        xActorPermissions,
    }: {
        id: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ServiceEndpoint;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/service-endpoints/{id}/check',
            path: {
                'id': id,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Bat endpoint (enabled=true)
     * @returns any OK
     * @throws ApiError
     */
    public static postServiceEndpointsEnable({
        id,
        xActorPermissions,
    }: {
        id: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ServiceEndpoint;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/service-endpoints/{id}/enable',
            path: {
                'id': id,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Tat endpoint (enabled=false). Chan neu la endpoint HEALTHY cuoi cung.
     * @returns any OK
     * @throws ApiError
     */
    public static postServiceEndpointsDisable({
        id,
        xActorPermissions,
    }: {
        id: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ServiceEndpoint;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/service-endpoints/{id}/disable',
            path: {
                'id': id,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
                409: `LAST_HEALTHY_ENDPOINT`,
            },
        });
    }
    /**
     * Bat/tat maintenance mode (status -> MAINTENANCE, loai khoi active selection)
     * @returns any OK
     * @throws ApiError
     */
    public static postServiceEndpointsMaintenance({
        id,
        requestBody,
        xActorPermissions,
    }: {
        id: string,
        requestBody: MaintenanceRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ServiceEndpoint;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/service-endpoints/{id}/maintenance',
            path: {
                'id': id,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Lich su thay doi cua mot endpoint (moi PATCH la 1 revision)
     * @returns any OK
     * @throws ApiError
     */
    public static getServiceEndpointsRevisions({
        id,
        xActorPermissions,
    }: {
        id: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Array<ServiceEndpointRevision>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/service-endpoints/{id}/revisions',
            path: {
                'id': id,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
}
