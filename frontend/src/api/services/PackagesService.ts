/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { Package } from '../models/Package';
import type { PackageCreateRequest } from '../models/PackageCreateRequest';
import type { PackageUpdateRequest } from '../models/PackageUpdateRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class PackagesService {
    /**
     * List goi cuoc (loc theo tenant_id)
     * @returns any OK
     * @throws ApiError
     */
    public static getPackages({
        xActorPermissions,
        tenantId,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        tenantId?: string,
    }): CancelablePromise<{
        data?: Array<Package>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/packages',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'tenant_id': tenantId,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Tao goi cuoc moi
     * @returns any Created
     * @throws ApiError
     */
    public static postPackages({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: PackageCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Package;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/packages',
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
     * Chi tiet goi cuoc (kem subscriber_count)
     * @returns any OK
     * @throws ApiError
     */
    public static getPackages1({
        packageId,
        xActorPermissions,
    }: {
        packageId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Package;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/packages/{packageId}',
            path: {
                'packageId': packageId,
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
     * Cap nhat goi cuoc
     * @returns any Updated
     * @throws ApiError
     */
    public static patchPackages({
        packageId,
        requestBody,
        xActorPermissions,
    }: {
        packageId: string,
        requestBody: PackageUpdateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Package;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/packages/{packageId}',
            path: {
                'packageId': packageId,
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
     * Xoa goi cuoc (soft delete). Chan neu con subscriber dang dung (PACKAGE_IN_USE).
     * @returns void
     * @throws ApiError
     */
    public static deletePackages({
        packageId,
        xActorPermissions,
    }: {
        packageId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/packages/{packageId}',
            path: {
                'packageId': packageId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
                409: `PACKAGE_IN_USE -- con subscriber dang gan goi nay`,
            },
        });
    }
}
