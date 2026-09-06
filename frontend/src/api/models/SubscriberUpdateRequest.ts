/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SubscriberUpdateRequest = {
    auth_type?: SubscriberUpdateRequest.auth_type;
    nas_device_id?: string | null;
    package_id?: string;
    status?: SubscriberUpdateRequest.status;
    expires_at?: string;
};
export namespace SubscriberUpdateRequest {
    export enum auth_type {
        PPPOE = 'PPPOE',
        HOTSPOT = 'HOTSPOT',
    }
    export enum status {
        ACTIVE = 'ACTIVE',
        SUSPENDED = 'SUSPENDED',
        EXPIRED = 'EXPIRED',
    }
}

