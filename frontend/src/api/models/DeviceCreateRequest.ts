/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type DeviceCreateRequest = {
    ship_id: string;
    code: string;
    name: string;
    role: DeviceCreateRequest.role;
    model?: string | null;
    serial?: string | null;
    architecture?: string | null;
    routeros_version?: string | null;
    api_transport?: DeviceCreateRequest.api_transport;
    credential_ref?: string | null;
    mgmt_endpoint_ref?: string | null;
    poll_interval_s?: number;
    /**
     * Inventory that (khong phai secret) -- IP quan tri cua router, dung de dung script push mau. Khac credential_ref/mgmt_endpoint_ref.
     */
    ip_address?: string | null;
    /**
     * Nguyen van RouterOS config (vd /export hide-sensitive) de tham khao/doi chieu -- server KHONG BAO GIO tu thuc thi hay day xuong router.
     */
    router_config_text?: string | null;
};
export namespace DeviceCreateRequest {
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
}

