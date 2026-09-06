/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TelemetryIdentity = {
    ship_id?: string;
    device_id?: string;
    interface_id?: string;
    user_identity?: string;
    user_identity_type?: TelemetryIdentity.user_identity_type;
    source_device_ref?: string;
    source_interface_ref?: string;
};
export namespace TelemetryIdentity {
    export enum user_identity_type {
        USERNAME = 'USERNAME',
        IP = 'IP',
        MAC = 'MAC',
        SESSION_ID = 'SESSION_ID',
        UNKNOWN = 'UNKNOWN',
    }
}

