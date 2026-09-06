/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Subscriber PPPoE/Hotspot. NAS = MikroTik router (devices.id). Mat khau RADIUS that (hash scrypt) khong bao gio tra ve -- chi bao da cap hay chua qua password_configured.
 */
export type Subscriber = {
    id?: string;
    tenant_id?: string;
    username?: string;
    auth_type?: Subscriber.auth_type;
    nas_device_id?: string | null;
    package_id?: string;
    status?: Subscriber.status;
    quota_used_bytes?: number;
    expires_at?: string;
    /**
     * true neu subscriber da duoc cap mat khau RADIUS that qua POST .../password.
     */
    password_configured?: boolean;
    password_issued_at?: string | null;
    created_at?: string;
    updated_at?: string;
};
export namespace Subscriber {
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

