/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from '../models/BaseMeta';
import type { CrewRadiusHealthResponse } from '../models/CrewRadiusHealthResponse';
import type { CrewRawAccountingResponse } from '../models/CrewRawAccountingResponse';
import type { CrewSessionsResponse } from '../models/CrewSessionsResponse';
import type { CrewUsersResponse } from '../models/CrewUsersResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CrewService {
    /**
     * CREW user list with RADIUS-derived usage for a period
     * @returns CrewUsersResponse CREW users
     * @throws ApiError
     */
    public static getShipsCrewUsers({
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
    }): CancelablePromise<CrewUsersResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/crew/users',
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
     * RADIUS session drill-down for one CREW user
     * @returns CrewSessionsResponse Sessions
     * @throws ApiError
     */
    public static getShipsCrewUsersSessions({
        shipId,
        username,
        cursor,
        limit = 100,
        xActorPermissions,
    }: {
        shipId: string,
        username: string,
        cursor?: string,
        limit?: number,
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<CrewSessionsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/crew/users/{username}/sessions',
            path: {
                'shipId': shipId,
                'username': username,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
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
     * Ngat 1 phien RADIUS dang ACTIVE (CoA/Disconnect-Request that, RFC 5176)
     * Gui Disconnect-Request toi NAS (router) dang giu phien nay. KHONG tu danh dau session CLOSED o day -- trang thai that chi doi khi Accounting-Stop that su toi. Router phai da bat "RADIUS incoming" (accept-from chua IP backend), neu khong se TIMEOUT.
     * @returns any NAS da xac nhan (Disconnect-ACK)
     * @throws ApiError
     */
    public static postShipsCrewUsersSessionsDisconnect({
        shipId,
        username,
        sessionId,
        xActorPermissions,
    }: {
        shipId: string,
        username: string,
        sessionId: string,
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: {
            acknowledged?: boolean;
            message?: string;
        };
        meta?: BaseMeta;
        error?: any;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/ships/{shipId}/crew/users/{username}/sessions/{sessionId}/disconnect',
            path: {
                'shipId': shipId,
                'username': username,
                'sessionId': sessionId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND hoac RADIUS_SESSION_NOT_FOUND`,
                409: `RADIUS_SESSION_NOT_ACTIVE`,
                502: `RADIUS_DISCONNECT_FAILED -- NAS tu choi (NAK), timeout, hoac loi mang`,
            },
        });
    }
    /**
     * RADIUS HA/freshness status for one ship
     * @returns CrewRadiusHealthResponse RADIUS health
     * @throws ApiError
     */
    public static getShipsCrewRadiusHealth({
        shipId,
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<CrewRadiusHealthResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/crew/radius-health',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN`,
                404: `SHIP_NOT_FOUND`,
            },
        });
    }
    /**
     * Raw RADIUS accounting event drill-down
     * @returns CrewRawAccountingResponse Raw accounting records
     * @throws ApiError
     */
    public static getShipsCrewRawAccounting({
        shipId,
        from,
        to,
        timezone,
        granularity = '1h',
        username,
        acctSessionId,
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
        username?: string,
        acctSessionId?: string,
        cursor?: string,
        limit?: number,
        /**
         * Temporary AuthStubGuard permission header; production authentication is not implemented in this phase.
         */
        xActorPermissions?: string,
    }): CancelablePromise<CrewRawAccountingResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}/crew/raw-accounting',
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
                'username': username,
                'acct_session_id': acctSessionId,
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
