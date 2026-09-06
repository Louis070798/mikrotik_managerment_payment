/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type InterfaceCreateRequest = {
    name: string;
    type: InterfaceCreateRequest.type;
    mac?: string | null;
    parent_interface_id?: string | null;
    snmp_index?: number | null;
    speed_bps?: number | null;
    mtu?: number | null;
};
export namespace InterfaceCreateRequest {
    export enum type {
        ETHER = 'ETHER',
        VLAN = 'VLAN',
        BRIDGE = 'BRIDGE',
        WIREGUARD = 'WIREGUARD',
        ZEROTIER = 'ZEROTIER',
        LTE = 'LTE',
        SFP = 'SFP',
        PPPOE = 'PPPOE',
    }
}

