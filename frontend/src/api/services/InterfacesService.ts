/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssignZoneRequest } from '../models/AssignZoneRequest';
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { Interface } from '../models/Interface';
import type { InterfaceCreateRequest } from '../models/InterfaceCreateRequest';
import type { InterfaceUpdateRequest } from '../models/InterfaceUpdateRequest';
import type { NetworkZone } from '../models/NetworkZone';
import type { ZoneCreateRequest } from '../models/ZoneCreateRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class InterfacesService {
    /**
     * List zones cua mot tau (CREW/BUSINESS/MANAGEMENT)
     * @returns any OK
     * @throws ApiError
     */
    public static getShipsZones({
        shipId,
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Array<NetworkZone>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/zones',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Create zone cho mot tau
     * @returns any Created
     * @throws ApiError
     */
    public static postShipsZones({
        shipId,
        requestBody,
        xActorPermissions,
    }: {
        shipId: string,
        requestBody: ZoneCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: NetworkZone;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/ships/{shipId}/zones',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `SHIP_NOT_FOUND`,
            },
        });
    }
    /**
     * List tat ca interface cua moi device thuoc mot tau
     * @returns any OK
     * @throws ApiError
     */
    public static getShipsInterfaces({
        shipId,
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Array<Interface>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/interfaces',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Create interface cho mot device
     * @returns any Created
     * @throws ApiError
     */
    public static postDevicesInterfaces({
        deviceId,
        requestBody,
        xActorPermissions,
    }: {
        deviceId: string,
        requestBody: InterfaceCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Interface;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/devices/{deviceId}/interfaces',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `DEVICE_NOT_FOUND`,
            },
        });
    }
    /**
     * Get interface detail
     * @returns any OK
     * @throws ApiError
     */
    public static getInterfaces({
        interfaceId,
        xActorPermissions,
    }: {
        interfaceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Interface;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/interfaces/{interfaceId}',
            path: {
                'interfaceId': interfaceId,
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
     * Update interface (khong doi accounting_group/zone_id -- dung assign-zone)
     * @returns any Updated
     * @throws ApiError
     */
    public static patchInterfaces({
        interfaceId,
        requestBody,
        xActorPermissions,
    }: {
        interfaceId: string,
        requestBody: InterfaceUpdateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Interface;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/interfaces/{interfaceId}',
            path: {
                'interfaceId': interfaceId,
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
     * Gan zone + accounting_group (WAN/CREW/BUSINESS/MANAGEMENT) cho interface
     * @returns any Assigned
     * @throws ApiError
     */
    public static postInterfacesAssignZone({
        interfaceId,
        requestBody,
        xActorPermissions,
    }: {
        interfaceId: string,
        requestBody: AssignZoneRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Interface;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/interfaces/{interfaceId}/assign-zone',
            path: {
                'interfaceId': interfaceId,
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
                409: `INTERFACE_DOUBLE_COUNT -- interface cha/con da dung cung accounting_group + counted`,
            },
        });
    }
}
