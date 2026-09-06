/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuditLogEntry } from '../models/AuditLogEntry';
import type { BaseMeta } from '../models/BaseMeta';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuditService {
    /**
     * List audit log (loc resource_type/resource_id/actor_id/action/from/to)
     * @returns any OK
     * @throws ApiError
     */
    public static getAuditLogs({
        xActorPermissions,
        resourceType,
        resourceId,
        actorId,
        action,
        from,
        to,
        limit = 50,
        offset,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        resourceType?: string,
        resourceId?: string,
        actorId?: string,
        action?: string,
        from?: string,
        to?: string,
        limit?: number,
        offset?: number,
    }): CancelablePromise<{
        data?: Array<AuditLogEntry>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/audit-logs',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'resource_type': resourceType,
                'resource_id': resourceId,
                'actor_id': actorId,
                'action': action,
                'from': from,
                'to': to,
                'limit': limit,
                'offset': offset,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
}
