/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ZeroTierCreateNetworkRequest } from '../models/ZeroTierCreateNetworkRequest';
import type { ZeroTierMemberResponse } from '../models/ZeroTierMemberResponse';
import type { ZeroTierMembersResponse } from '../models/ZeroTierMembersResponse';
import type { ZeroTierNetworkDetailResponse } from '../models/ZeroTierNetworkDetailResponse';
import type { ZeroTierNetworksResponse } from '../models/ZeroTierNetworksResponse';
import type { ZeroTierUpdateMemberRequest } from '../models/ZeroTierUpdateMemberRequest';
import type { ZeroTierUpdateNetworkRequest } from '../models/ZeroTierUpdateNetworkRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ZeroTierService {
    /**
     * Danh sach network do ZeroTier controller nay quan ly (goi that qua Controller API)
     * Proxy toi ZeroTier controller that (dia chi/secret lay qua service_endpoints "zerotier.controller", ADR-04/05 -- khong hard-code). 422 neu chua dang ky endpoint/secret_ref; 502/503 neu controller loi/khong ket noi duoc.
     * @returns ZeroTierNetworksResponse Danh sach network
     * @throws ApiError
     */
    public static getZerotierNetworks({
        xActorPermissions,
    }: {
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<ZeroTierNetworksResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/zerotier/networks',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
                422: `ZEROTIER_NOT_CONFIGURED`,
                502: `ZEROTIER_UPSTREAM_ERROR`,
                503: `ZEROTIER_UNREACHABLE`,
            },
        });
    }
    /**
     * Tao ZeroTier network moi that tren controller
     * POST vao /controller/network/{controllerAddress}______ that (chuan ZeroTier). Chi nhan name + private o buoc tao -- IP pool/route/DNS cau hinh sau qua PATCH.
     * @returns ZeroTierNetworkDetailResponse Da tao
     * @throws ApiError
     */
    public static postZerotierNetworks({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: ZeroTierCreateNetworkRequest,
        xActorPermissions?: string,
    }): CancelablePromise<ZeroTierNetworkDetailResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/zerotier/networks',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_ERROR`,
                403: `FORBIDDEN`,
                422: `ZEROTIER_NOT_CONFIGURED`,
                502: `ZEROTIER_UPSTREAM_ERROR`,
                503: `ZEROTIER_UNREACHABLE`,
            },
        });
    }
    /**
     * Chi tiet 1 network ZeroTier (IP pool, route, DNS, auto-assign)
     * @returns ZeroTierNetworkDetailResponse OK
     * @throws ApiError
     */
    public static getZerotierNetworks1({
        networkId,
        xActorPermissions,
    }: {
        /**
         * Network ID that (16 ky tu hex).
         */
        networkId: string,
        xActorPermissions?: string,
    }): CancelablePromise<ZeroTierNetworkDetailResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/zerotier/networks/{networkId}',
            path: {
                'networkId': networkId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
                422: `ZEROTIER_NOT_CONFIGURED`,
                502: `ZEROTIER_UPSTREAM_ERROR`,
                503: `ZEROTIER_UNREACHABLE`,
            },
        });
    }
    /**
     * Cap nhat network ZeroTier (ten, private/public, IP pool, route, DNS, auto-assign IPv4)
     * Chi gui field thuc su doi -- controller merge, khong replace toan bo. Neu tat auto-assign, phai tu gan IP tay qua PATCH member.
     * @returns ZeroTierNetworkDetailResponse Updated
     * @throws ApiError
     */
    public static patchZerotierNetworks({
        networkId,
        requestBody,
        xActorPermissions,
    }: {
        networkId: string,
        requestBody: ZeroTierUpdateNetworkRequest,
        xActorPermissions?: string,
    }): CancelablePromise<ZeroTierNetworkDetailResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/zerotier/networks/{networkId}',
            path: {
                'networkId': networkId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_ERROR`,
                403: `FORBIDDEN`,
                502: `ZEROTIER_UPSTREAM_ERROR`,
                503: `ZEROTIER_UNREACHABLE`,
            },
        });
    }
    /**
     * Xoa han network ZeroTier tren controller (khong the hoan tac)
     * @returns void
     * @throws ApiError
     */
    public static deleteZerotierNetworks({
        networkId,
        xActorPermissions,
    }: {
        networkId: string,
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/zerotier/networks/{networkId}',
            path: {
                'networkId': networkId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
                502: `ZEROTIER_UPSTREAM_ERROR`,
                503: `ZEROTIER_UNREACHABLE`,
            },
        });
    }
    /**
     * Chi tiet thanh vien cua 1 network ZeroTier (goi that qua Controller API)
     * @returns ZeroTierMembersResponse Danh sach thanh vien
     * @throws ApiError
     */
    public static getZerotierNetworksMembers({
        networkId,
        xActorPermissions,
    }: {
        /**
         * Network ID that (16 ky tu hex, tra ve tu GET /zerotier/networks).
         */
        networkId: string,
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<ZeroTierMembersResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/zerotier/networks/{networkId}/members',
            path: {
                'networkId': networkId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
                422: `ZEROTIER_NOT_CONFIGURED`,
                502: `ZEROTIER_UPSTREAM_ERROR`,
                503: `ZEROTIER_UNREACHABLE`,
            },
        });
    }
    /**
     * Cap phep / thu hoi / gan IP tay cho 1 thanh vien ZeroTier
     * Khi gui ip_assignments, server tu kem noAutoAssignIps=true (hanh vi that cua ZeroTier -- neu khong, controller se ghi de IP tay bang IP tu cap o lan commit ke tiep khi auto-assign dang bat).
     * @returns ZeroTierMemberResponse Updated
     * @throws ApiError
     */
    public static patchZerotierNetworksMembers({
        networkId,
        memberId,
        requestBody,
        xActorPermissions,
    }: {
        networkId: string,
        /**
         * ZeroTier node ID (10 ky tu hex).
         */
        memberId: string,
        requestBody: ZeroTierUpdateMemberRequest,
        xActorPermissions?: string,
    }): CancelablePromise<ZeroTierMemberResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/zerotier/networks/{networkId}/members/{memberId}',
            path: {
                'networkId': networkId,
                'memberId': memberId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_ERROR`,
                403: `FORBIDDEN`,
                502: `ZEROTIER_UPSTREAM_ERROR`,
                503: `ZEROTIER_UNREACHABLE`,
            },
        });
    }
    /**
     * Xoa han thanh vien khoi network ZeroTier (khong con tu ket noi lai duoc neu khong join lai tu client)
     * @returns void
     * @throws ApiError
     */
    public static deleteZerotierNetworksMembers({
        networkId,
        memberId,
        xActorPermissions,
    }: {
        networkId: string,
        memberId: string,
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/zerotier/networks/{networkId}/members/{memberId}',
            path: {
                'networkId': networkId,
                'memberId': memberId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
                502: `ZEROTIER_UPSTREAM_ERROR`,
                503: `ZEROTIER_UNREACHABLE`,
            },
        });
    }
}
