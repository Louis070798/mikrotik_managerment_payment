/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { SettingsDatabase } from './SettingsDatabase';
export type SettingsResponse = {
    data?: {
        database?: SettingsDatabase;
        /**
         * Dia chi server RADIUS nhu ROUTER nhin thay (thuong la IP ZeroTier cua server) -- KHONG phai dia chi backend tu bind. Chi dung de sinh lenh "/radius add address=..." cho MikroTik.
         */
        radius_server_address?: string | null;
        radius_auth_port?: number;
        radius_acct_port?: number;
        netflow_port?: number;
        dns_log_port?: number;
        /**
         * Cong CoA/Disconnect ma ROUTER lang nghe (RFC 5176, RouterOS "/radius incoming"). Mac dinh 3799.
         */
        radius_coa_port?: number;
        zerotier_controller_token_configured?: boolean;
        /**
         * Chi co o response cua PATCH -- true neu vua ghi thay doi xuong .env, can restart backend de ap dung.
         */
        restart_required?: boolean;
    };
    meta?: BaseMeta;
    error?: any;
};

