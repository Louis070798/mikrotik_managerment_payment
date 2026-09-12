/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { Tenant } from '../models/Tenant';
import type { TenantCreateRequest } from '../models/TenantCreateRequest';
import type { TenantPasswordResponse } from '../models/TenantPasswordResponse';
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
     * Tao tenant moi (tu cap luon tai khoan dang nhap -- username + mat khau) -- mat khau do ADMIN TU GO trong requestBody
     * Tenant la 1 tai khoan dang nhap that (POST /auth/login) -- luon sinh username (tu code) NGAY luc tao. Mat khau do admin nhap truc tiep qua requestBody.password, khong con tu sinh ngau nhien nua. Server chi giu ban bam, khong bao gio tra lai qua response nao.
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
    /**
     * Dat mat khau dang nhap cho tenant (sinh username tu code neu chua co) bang mat khau ADMIN TU GO
     * Nang cap tu placeholder Auth/RBAC (Tenants.tsx) -- tenant nay tro thanh 1 tai khoan dang nhap that qua POST /auth/login. Mat khau do admin nhap trong requestBody, khong con tu sinh ngau nhien -- server chi giu ban bam scrypt, khong tra lai plaintext.
     * @returns TenantPasswordResponse Created
     * @throws ApiError
     */
    public static postTenantsPassword({
        tenantId,
        requestBody,
        xActorPermissions,
    }: {
        tenantId: string,
        requestBody: {
            password: string;
        },
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<TenantPasswordResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/tenants/{tenantId}/password',
            path: {
                'tenantId': tenantId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Thu hoi tai khoan dang nhap cua tenant (khong xoa tenant)
     * @returns void
     * @throws ApiError
     */
    public static deleteTenantsPassword({
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
            url: '/tenants/{tenantId}/password',
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
}
