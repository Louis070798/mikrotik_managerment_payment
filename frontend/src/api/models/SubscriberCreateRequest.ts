/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type SubscriberCreateRequest = {
    tenant_id: string;
    username: string;
    /**
     * Mat khau dang nhap that -- ADMIN TU GO khi tao user (khong con tu sinh ngau nhien). Server chi luu ban bam (scrypt), khong bao gio tra lai qua GET/PATCH.
     */
    password: string;
    display_name?: string | null;
    notes?: string | null;
    auth_type: SubscriberCreateRequest.auth_type;
    nas_device_id?: string | null;
    package_id: string;
    expires_at: string;
};
export namespace SubscriberCreateRequest {
    export enum auth_type {
        PPPOE = 'PPPOE',
        HOTSPOT = 'HOTSPOT',
    }
}

