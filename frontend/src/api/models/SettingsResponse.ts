/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { SettingsDatabase } from './SettingsDatabase';
export type SettingsResponse = {
    data?: {
        database?: SettingsDatabase;
        radius_auth_port?: number;
        radius_acct_port?: number;
        netflow_port?: number;
        dns_log_port?: number;
        zerotier_controller_token_configured?: boolean;
        /**
         * Chi co o response cua PATCH -- true neu vua ghi thay doi xuong .env, can restart backend de ap dung.
         */
        restart_required?: boolean;
    };
    meta?: BaseMeta;
    error?: any;
};

