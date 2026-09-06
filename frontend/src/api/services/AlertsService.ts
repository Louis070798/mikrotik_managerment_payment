/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AckAlertRequest } from '../models/AckAlertRequest';
import type { Alert } from '../models/Alert';
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { ResolveAlertRequest } from '../models/ResolveAlertRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AlertsService {
    /**
     * List alerts (loc status/severity)
     * @returns any OK
     * @throws ApiError
     */
    public static getAlerts({
        xActorPermissions,
        status,
        severity,
        limit = 50,
        offset,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        status?: 'FIRING' | 'ACKED' | 'RESOLVED',
        severity?: 'INFO' | 'WARNING' | 'MAJOR' | 'CRITICAL',
        limit?: number,
        offset?: number,
    }): CancelablePromise<{
        data?: Array<Alert>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/alerts',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'status': status,
                'severity': severity,
                'limit': limit,
                'offset': offset,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Alert detail
     * @returns any OK
     * @throws ApiError
     */
    public static getAlerts1({
        alertId,
        xActorPermissions,
    }: {
        alertId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Alert;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/alerts/{alertId}',
            path: {
                'alertId': alertId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `ALERT_NOT_FOUND`,
            },
        });
    }
    /**
     * Xac nhan da biet alert (FIRING -> ACKED)
     * @returns any OK
     * @throws ApiError
     */
    public static postAlertsAck({
        alertId,
        xActorPermissions,
        requestBody,
    }: {
        alertId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        requestBody?: AckAlertRequest,
    }): CancelablePromise<{
        data?: Alert;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/alerts/{alertId}/ack',
            path: {
                'alertId': alertId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `ALERT_NOT_FOUND hoac khong o trang thai FIRING`,
            },
        });
    }
    /**
     * Danh dau alert da xu ly xong (reason bat buoc, di vao audit)
     * @returns any OK
     * @throws ApiError
     */
    public static postAlertsResolve({
        alertId,
        requestBody,
        xActorPermissions,
    }: {
        alertId: string,
        requestBody: ResolveAlertRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Alert;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/alerts/{alertId}/resolve',
            path: {
                'alertId': alertId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `ALERT_NOT_FOUND hoac da resolved`,
            },
        });
    }
}
