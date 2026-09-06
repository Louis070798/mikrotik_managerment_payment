/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { Tenant } from '../models/Tenant';
import type { TenantCreateRequest } from '../models/TenantCreateRequest';
import type { TenantUpdateRequest } from '../models/TenantUpdateRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class TenantsService {
    /**
     * List tenant (phang, dung parent_id de tu dung cay o frontend)
     * @returns any OK
     * @throws ApiError
     */
    public static getTenants({
        xActorPermissions,
        parentId,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        parentId?: string,
    }): CancelablePromise<{
        data?: Array<Tenant>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/tenants',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'parent_id': parentId,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Tao tenant moi
     * @returns any Created
     * @throws ApiError
     */
    public static postTenants({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: TenantCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Tenant;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/tenants',
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
     * Chi tiet tenant
     * @returns any OK
     * @throws ApiError
     */
    public static getTenants1({
        tenantId,
        xActorPermissions,
    }: {
        tenantId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Tenant;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/tenants/{tenantId}',
            path: {
                'tenantId': tenantId,
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
     * Cap nhat tenant
     * @returns any Updated
     * @throws ApiError
     */
    public static patchTenants({
        tenantId,
        requestBody,
        xActorPermissions,
    }: {
        tenantId: string,
        requestBody: TenantUpdateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Tenant;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/tenants/{tenantId}',
            path: {
                'tenantId': tenantId,
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
     * Xoa tenant (soft delete). Chan neu con tenant con hoac subscriber (TENANT_HAS_DEPENDENTS).
     * @returns void
     * @throws ApiError
     */
    public static deleteTenants({
        tenantId,
        xActorPermissions,
    }: {
        tenantId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/tenants/{tenantId}',
            path: {
                'tenantId': tenantId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
                409: `TENANT_HAS_DEPENDENTS -- con tenant con hoac subscriber dang thuoc tenant nay`,
            },
        });
    }
}
