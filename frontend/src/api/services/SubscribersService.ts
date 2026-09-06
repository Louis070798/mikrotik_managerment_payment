/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { Subscriber } from '../models/Subscriber';
import type { SubscriberBulkAssignRequest } from '../models/SubscriberBulkAssignRequest';
import type { SubscriberCreateRequest } from '../models/SubscriberCreateRequest';
import type { SubscriberPasswordResponse } from '../models/SubscriberPasswordResponse';
import type { SubscriberUpdateRequest } from '../models/SubscriberUpdateRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SubscribersService {
    /**
     * List subscriber PPPoE/Hotspot (loc tenant_id/status, tim theo username qua q)
     * @returns any OK
     * @throws ApiError
     */
    public static getSubscribers({
        xActorPermissions,
        tenantId,
        nasDeviceId,
        status,
        q,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        tenantId?: string,
        /**
         * Loc theo NAS (MikroTik router) dang gan cho subscriber -- dung o Device Detail de xem user gan vao thiet bi.
         */
        nasDeviceId?: string,
        status?: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED',
        /**
         * Tim theo username (chua dung, khong phan biet hoa/thuong)
         */
        q?: string,
    }): CancelablePromise<{
        data?: Array<Subscriber>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/subscribers',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'tenant_id': tenantId,
                'nas_device_id': nasDeviceId,
                'status': status,
                'q': q,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Tao subscriber moi (gan tenant + goi cuoc, tuy chon NAS)
     * @returns any Created
     * @throws ApiError
     */
    public static postSubscribers({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: SubscriberCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Subscriber;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/subscribers',
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
     * Gan hang loat goi cuoc va/hoac NAS cho nhieu subscriber cung luc
     * De trong package_id hoac nas_device_id = giu nguyen gia tri hien tai cua tung subscriber (README thiet ke muc 7 buoc 2).
     * @returns any OK
     * @throws ApiError
     */
    public static postSubscribersBulkAssign({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: SubscriberBulkAssignRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: {
            updated_count?: number;
            subscribers?: Array<Subscriber>;
        };
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/subscribers/bulk-assign',
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
     * Chi tiet subscriber
     * @returns any OK
     * @throws ApiError
     */
    public static getSubscribers1({
        subscriberId,
        xActorPermissions,
    }: {
        subscriberId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Subscriber;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/subscribers/{subscriberId}',
            path: {
                'subscriberId': subscriberId,
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
     * Cap nhat subscriber (doi goi/NAS/trang thai/han dung)
     * @returns any Updated
     * @throws ApiError
     */
    public static patchSubscribers({
        subscriberId,
        requestBody,
        xActorPermissions,
    }: {
        subscriberId: string,
        requestBody: SubscriberUpdateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Subscriber;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/subscribers/{subscriberId}',
            path: {
                'subscriberId': subscriberId,
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
     * Xoa subscriber (soft delete)
     * @returns void
     * @throws ApiError
     */
    public static deleteSubscribers({
        subscriberId,
        xActorPermissions,
    }: {
        subscriberId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/subscribers/{subscriberId}',
            path: {
                'subscriberId': subscriberId,
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
     * Cap mat khau RADIUS moi cho subscriber
     * Sinh mat khau that ngau nhien, bam scrypt luu lai (backend/src/libs/password-hash/), tra plaintext DUY NHAT 1 LAN. RADIUS Access-Request (PAP) ke tiep tu router dung duoc ngay.
     * @returns any Created
     * @throws ApiError
     */
    public static postSubscribersPassword({
        subscriberId,
        xActorPermissions,
    }: {
        subscriberId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: SubscriberPasswordResponse;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/subscribers/{subscriberId}/password',
            path: {
                'subscriberId': subscriberId,
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
     * Thu hoi mat khau RADIUS cua subscriber
     * Xoa password_hash/password_issued_at -- Access-Request ke tiep voi mat khau cu se bi tu choi (Access-Reject).
     * @returns void
     * @throws ApiError
     */
    public static deleteSubscribersPassword({
        subscriberId,
        xActorPermissions,
    }: {
        subscriberId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/subscribers/{subscriberId}/password',
            path: {
                'subscriberId': subscriberId,
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
