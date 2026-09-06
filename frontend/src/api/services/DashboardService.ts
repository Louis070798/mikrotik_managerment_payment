/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AreaDashboardResponse } from '../models/AreaDashboardResponse';
import type { GlobalDashboardResponse } from '../models/GlobalDashboardResponse';
import type { ShipDashboardResponse } from '../models/ShipDashboardResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DashboardService {
    /**
     * Global dashboard metrics
     * @returns GlobalDashboardResponse OK
     * @throws ApiError
     */
    public static getDashboardGlobal({
        from,
        to,
        timezone,
        granularity = '1h',
        zone = 'ALL',
    }: {
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
        zone?: 'CREW' | 'BUSINESS' | 'MANAGEMENT' | 'ALL',
    }): CancelablePromise<GlobalDashboardResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/dashboard/global',
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
                'zone': zone,
            },
            errors: {
                403: `FORBIDDEN`,
            },
        });
    }
    /**
     * Area dashboard metrics
     * @returns AreaDashboardResponse OK. Inventory is available even when telemetry is insufficient.
     * @throws ApiError
     */
    public static getAreasDashboard({
        areaId,
        from,
        to,
        timezone,
        granularity = '1h',
        zone = 'ALL',
    }: {
        areaId: string,
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
        zone?: 'CREW' | 'BUSINESS' | 'MANAGEMENT' | 'ALL',
    }): CancelablePromise<AreaDashboardResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/areas/{areaId}/dashboard',
            path: {
                'areaId': areaId,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
                'zone': zone,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `AREA_NOT_FOUND`,
            },
        });
    }
    /**
     * Ship dashboard
     * @returns ShipDashboardResponse OK
     * @throws ApiError
     */
    public static getShipsDashboard({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
        zone = 'ALL',
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
        zone?: 'CREW' | 'BUSINESS' | 'MANAGEMENT' | 'ALL',
    }): CancelablePromise<ShipDashboardResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/dashboard',
            path: {
                'shipId': shipId,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
                'zone': zone,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND`,
            },
        });
    }
}
