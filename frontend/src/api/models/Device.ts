/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Device = {
    id?: string;
    ship_id?: string;
    code?: string;
    name?: string;
    role?: Device.role;
    model?: string | null;
    serial?: string | null;
    architecture?: string | null;
    routeros_version?: string | null;
    device_mode?: string | null;
    api_transport?: Device.api_transport;
    /**
     * Tham chieu toi secret store (ADR-05), KHONG PHAI gia tri credential that.
     */
    credential_ref?: string | null;
    mgmt_endpoint_ref?: string | null;
    status?: Device.status;
    last_seen_at?: string | null;
    poll_interval_s?: number;
    /**
     * Inventory that (khong phai secret) -- IP quan tri cua router, dung de dung script push mau. Khac credential_ref/mgmt_endpoint_ref.
     */
    ip_address?: string | null;
    /**
     * true neu thiet bi da duoc cap push API key (POST .../push-key). KHONG BAO GIO tra ve chinh key/hash -- giong secret_configured (ADR-05).
     */
    push_key_configured?: boolean;
    push_key_issued_at?: string | null;
    /**
     * true neu thiet bi da co credential_ref (POST .../radius-secret hoac PATCH tay). KHONG BAO GIO tra ve chinh secret that -- giong secret_configured (ADR-05).
     */
    radius_secret_configured?: boolean;
    radius_secret_issued_at?: string | null;
    /**
     * Nguyen van RouterOS config (vd /export hide-sensitive) de tham khao/doi chieu -- server KHONG BAO GIO tu thuc thi hay day xuong router.
     */
    router_config_text?: string | null;
    router_config_updated_at?: string | null;
    created_at?: string;
    updated_at?: string;
};
export namespace Device {
    export enum role {
        EDGE = 'EDGE',
        CORE = 'CORE',
        SWITCH = 'SWITCH',
        AP = 'AP',
        CPE = 'CPE',
    }
    export enum api_transport {
        REST = 'REST',
        API_SSL = 'API_SSL',
        API = 'API',
    }
    export enum status {
        UNKNOWN = 'UNKNOWN',
        ONLINE = 'ONLINE',
        DEGRADED = 'DEGRADED',
        OFFLINE = 'OFFLINE',
        MAINTENANCE = 'MAINTENANCE',
    }
}

