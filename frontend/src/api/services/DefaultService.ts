/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AreasResponse } from '../models/AreasResponse';
import type { AuthSuccessResponse } from '../models/AuthSuccessResponse';
import type { MeResponse } from '../models/MeResponse';
import type { ShipsResponse } from '../models/ShipsResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * Login
     * @returns AuthSuccessResponse Successful login
     * @throws ApiError
     */
    public static postAuthLogin({
        requestBody,
    }: {
        requestBody: {
            username?: string;
            password?: string;
        },
    }): CancelablePromise<AuthSuccessResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
            },
        });
    }
    /**
     * Get user profile
     * @returns MeResponse OK
     * @throws ApiError
     */
    public static getAuthMe(): CancelablePromise<MeResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/auth/me',
        });
    }
    /**
     * List areas
     * @returns AreasResponse OK
     * @throws ApiError
     */
    public static getAreas({
        xActorPermissions,
    }: {
        /**
         * TAM THOI (AuthStubGuard) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<AreasResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/areas',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission (AuthStubGuard, header x-actor-permissions)`,
            },
        });
    }
    /**
     * List ships
     * @returns ShipsResponse OK
     * @throws ApiError
     */
    public static getShips({
        areaId,
        xActorPermissions,
        status,
        q,
    }: {
        areaId?: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        status?: 'PLANNED' | 'COMMISSIONING' | 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED',
        /**
         * Tim theo ten (ILIKE)
         */
        q?: string,
    }): CancelablePromise<ShipsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'area_id': areaId,
                'status': status,
                'q': q,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission (AuthStubGuard, header x-actor-permissions)`,
            },
        });
    }
}
