/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Ghi lai moi thay doi ghi (create/update/delete) tren Inventory + Service Endpoints. before/after/diff phuc vu doi chieu; secret luon duoc redact truoc khi ghi.
 */
export type AuditLogEntry = {
    id?: string;
    actor?: {
        type?: string;
        id?: string | null;
        label?: string | null;
    };
    /**
     * vd 'area.create', 'service_endpoint.update'
     */
    action?: string;
    resource?: {
        type?: string;
        id?: string | null;
    };
    scope?: Record<string, any> | null;
    result?: AuditLogEntry.result;
    reason?: string | null;
    before?: Record<string, any> | null;
    after?: Record<string, any> | null;
    diff?: Record<string, any> | null;
    request_id?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    created_at?: string;
};
export namespace AuditLogEntry {
    export enum result {
        SUCCESS = 'SUCCESS',
        FAILURE = 'FAILURE',
    }
}

