/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GlobalReconciliationResponse } from '../models/GlobalReconciliationResponse';
import type { ReconciliationByWanResponse } from '../models/ReconciliationByWanResponse';
import type { ReconciliationRawRecordsResponse } from '../models/ReconciliationRawRecordsResponse';
import type { ReconciliationResponse } from '../models/ReconciliationResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ReconciliationService {
    /**
     * Tong data + do lech (gap) toan ham doi
     * Gop cung cong thuc computeGap() dang dung o cap tung tau (ships/{shipId}/reconciliation) len toan ham doi -- tong byte WAN + CREW/BUSINESS/MANAGEMENT cong don qua tat ca tau, va breakdown do lech tung tau sap theo |gap| giam dan. 422 neu hoan toan khong co interface_counter_deltas nao trong ca ham doi cho khoang thoi gian nay.
     * @returns GlobalReconciliationResponse OK
     * @throws ApiError
     */
    public static getDashboardGlobalReconciliation({
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
    }): CancelablePromise<GlobalReconciliationResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/dashboard/global/reconciliation',
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
                'zone': zone,
            },
            errors: {
                403: `FORBIDDEN`,
                422: `RECONCILIATION_UNAVAILABLE`,
            },
        });
    }
    /**
     * Ship data reconciliation summary
     * @returns ReconciliationResponse Reconciliation result
     * @throws ApiError
     */
    public static getShipsReconciliation({
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
    }): CancelablePromise<ReconciliationResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/reconciliation',
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
                422: `RECONCILIATION_UNAVAILABLE`,
            },
        });
    }
    /**
     * Reconciliation grouped by WAN input
     * @returns ReconciliationByWanResponse Reconciliation by WAN
     * @throws ApiError
     */
    public static getShipsReconciliationByWan({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
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
    }): CancelablePromise<ReconciliationByWanResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/reconciliation/by-wan',
            path: {
                'shipId': shipId,
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
                422: `RECONCILIATION_UNAVAILABLE`,
            },
        });
    }
    /**
     * Reconciliation grouped by interface
     * @returns ReconciliationByWanResponse Reconciliation by interface
     * @throws ApiError
     */
    public static getShipsReconciliationByInterface({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
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
    }): CancelablePromise<ReconciliationByWanResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/reconciliation/by-interface',
            path: {
                'shipId': shipId,
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
                422: `RECONCILIATION_UNAVAILABLE`,
            },
        });
    }
    /**
     * Reconciliation grouped by network zone
     * @returns ReconciliationByWanResponse Reconciliation by zone
     * @throws ApiError
     */
    public static getShipsReconciliationByZone({
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
    }): CancelablePromise<ReconciliationByWanResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/reconciliation/by-zone',
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
                422: `RECONCILIATION_UNAVAILABLE`,
            },
        });
    }
    /**
     * Raw reconciliation records drill-down
     * @returns ReconciliationRawRecordsResponse Raw records
     * @throws ApiError
     */
    public static getShipsReconciliationRawRecords({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
        zone = 'ALL',
        limit = 100,
        cursor,
        source,
        reason,
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
        limit?: number,
        cursor?: string,
        source?: 'INTERFACE_COUNTER' | 'RADIUS_ACCOUNTING' | 'IPFIX' | 'DNS' | 'SYSLOG',
        reason?: string,
    }): CancelablePromise<ReconciliationRawRecordsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/reconciliation/raw-records',
            path: {
                'shipId': shipId,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
                'zone': zone,
                'limit': limit,
                'cursor': cursor,
                'source': source,
                'reason': reason,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND`,
                422: `RECONCILIATION_UNAVAILABLE`,
            },
        });
    }
    /**
     * Reconciliation gap time series
     * @returns ReconciliationByWanResponse Reconciliation time series
     * @throws ApiError
     */
    public static getShipsReconciliationTimeseries({
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
    }): CancelablePromise<ReconciliationByWanResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/reconciliation/timeseries',
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
                422: `RECONCILIATION_UNAVAILABLE`,
            },
        });
    }
}
