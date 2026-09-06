/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Lich su thay doi endpoint -- moi PATCH tao 1 revision, dung de audit/rollback thu cong.
 */
export type ServiceEndpointRevision = {
    version?: number;
    payload?: Record<string, any>;
    change_reason?: string | null;
    changed_by?: string | null;
    created_at?: string;
};

