/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SettingsUpdateRequest = {
    database?: {
        host?: string;
        port?: number;
        database?: string;
        username?: string;
        /**
         * Rong/thieu = giu nguyen mat khau hien tai.
         */
        password?: string;
    };
    radius_auth_port?: number;
    radius_acct_port?: number;
    netflow_port?: number;
    dns_log_port?: number;
    /**
     * Rong/thieu = giu nguyen.
     */
    zerotier_controller_token?: string;
    /**
     * Bat buoc -- di thang vao audit_logs.
     */
    reason: string;
};

