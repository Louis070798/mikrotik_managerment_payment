/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
export type AuthSuccessResponse = {
    data?: {
        token?: string;
        id?: string;
        name?: string;
        role?: AuthSuccessResponse.role;
        /**
         * CSV quyen duoc cap cho phien nay -- '*' cho admin, danh sach cu the cho tenant (xem AuthService.TENANT_PERMISSIONS). Frontend gui lai dung gia tri nay qua header x-actor-permissions moi request.
         */
        permissions?: string;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace AuthSuccessResponse {
    export enum role {
        ADMIN = 'admin',
        TENANT = 'tenant',
    }
}

