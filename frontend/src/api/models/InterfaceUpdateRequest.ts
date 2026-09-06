/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type InterfaceUpdateRequest = {
    name?: string;
    mac?: string | null;
    speed_bps?: number | null;
    mtu?: number | null;
    admin_state?: InterfaceUpdateRequest.admin_state;
    oper_state?: InterfaceUpdateRequest.oper_state;
};
export namespace InterfaceUpdateRequest {
    export enum admin_state {
        UP = 'UP',
        DOWN = 'DOWN',
        UNKNOWN = 'UNKNOWN',
    }
    export enum oper_state {
        UP = 'UP',
        DOWN = 'DOWN',
        UNKNOWN = 'UNKNOWN',
    }
}

