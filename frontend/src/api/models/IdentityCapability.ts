/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * States whether the system CAN identify a user/device for this zone at all — independent of whether data currently exists. CREW is always AVAILABLE (RADIUS); BUSINESS is NOT_AVAILABLE by default per SYSTEM_SPEC §4.3.
 */
export type IdentityCapability = {
    status: IdentityCapability.status;
    method: IdentityCapability.method;
    message: string;
};
export namespace IdentityCapability {
    export enum status {
        AVAILABLE = 'AVAILABLE',
        NOT_AVAILABLE = 'NOT_AVAILABLE',
    }
    export enum method {
        RADIUS = 'RADIUS',
        NONE = 'NONE',
    }
}

