/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BusinessDevicesResponse } from '../models/BusinessDevicesResponse';
import type { BusinessFlowsResponse } from '../models/BusinessFlowsResponse';
import type { BusinessRawRecordsResponse } from '../models/BusinessRawRecordsResponse';
import type { BusinessUsageResponse } from '../models/BusinessUsageResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class BusinessService {
    /**
     * BUSINESS device usage (IP/MAC/VLAN) for a period
     * @returns BusinessDevicesResponse BUSINESS devices
     * @throws ApiError
     */
    public static getShipsBusinessDevices({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * RFC3339 period start. Defaults to 24 hours before `to`.
         */
        from?: string,
        /**
         * RFC3339 period end. Defaults to now.
         */
        to?: string,
        /**
         * IANA timezone used for period bucketing.
         */
        timezone?: string,
        granularity?: '1m' | '5m' | '1h' | '1d',
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<BusinessDevicesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/business/devices',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND`,
            },
        });
    }
    /**
     * BUSINESS zone-level usage bucketed by granularity
     * @returns BusinessUsageResponse BUSINESS usage timeseries
     * @throws ApiError
     */
    public static getShipsBusinessUsage({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * RFC3339 period start. Defaults to 24 hours before `to`.
         */
        from?: string,
        /**
         * RFC3339 period end. Defaults to now.
         */
        to?: string,
        /**
         * IANA timezone used for period bucketing.
         */
        timezone?: string,
        granularity?: '1m' | '5m' | '1h' | '1d',
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<BusinessUsageResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/business/usage',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND`,
            },
        });
    }
    /**
     * BUSINESS flow summary (top destinations, unattributed bytes)
     * @returns BusinessFlowsResponse Flow summary
     * @throws ApiError
     */
    public static getShipsBusinessFlows({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * RFC3339 period start. Defaults to 24 hours before `to`.
         */
        from?: string,
        /**
         * RFC3339 period end. Defaults to now.
         */
        to?: string,
        /**
         * IANA timezone used for period bucketing.
         */
        timezone?: string,
        granularity?: '1m' | '5m' | '1h' | '1d',
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<BusinessFlowsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/business/flows',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND`,
            },
        });
    }
    /**
     * BUSINESS flows with unresolved classification (drill-down)
     * Every flow is classification_method=UNKNOWN in this phase (no classifier implemented), so this currently returns the same population as raw-records — kept as a distinct endpoint for when a real classifier exists.
     * @returns BusinessRawRecordsResponse Unknown flows
     * @throws ApiError
     */
    public static getShipsBusinessFlowsUnknown({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
        srcIp,
        dstIp,
        cursor,
        limit = 100,
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * RFC3339 period start. Defaults to 24 hours before `to`.
         */
        from?: string,
        /**
         * RFC3339 period end. Defaults to now.
         */
        to?: string,
        /**
         * IANA timezone used for period bucketing.
         */
        timezone?: string,
        granularity?: '1m' | '5m' | '1h' | '1d',
        srcIp?: string,
        dstIp?: string,
        cursor?: string,
        limit?: number,
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<BusinessRawRecordsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/business/flows/unknown',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
                'src_ip': srcIp,
                'dst_ip': dstIp,
                'cursor': cursor,
                'limit': limit,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND`,
            },
        });
    }
    /**
     * Raw IPFIX flow record drill-down
     * @returns BusinessRawRecordsResponse Raw flow records
     * @throws ApiError
     */
    public static getShipsBusinessRawRecords({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
        srcIp,
        dstIp,
        cursor,
        limit = 100,
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * RFC3339 period start. Defaults to 24 hours before `to`.
         */
        from?: string,
        /**
         * RFC3339 period end. Defaults to now.
         */
        to?: string,
        /**
         * IANA timezone used for period bucketing.
         */
        timezone?: string,
        granularity?: '1m' | '5m' | '1h' | '1d',
        srcIp?: string,
        dstIp?: string,
        cursor?: string,
        limit?: number,
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<BusinessRawRecordsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/business/raw-records',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
                'src_ip': srcIp,
                'dst_ip': dstIp,
                'cursor': cursor,
                'limit': limit,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND`,
            },
        });
    }
}
