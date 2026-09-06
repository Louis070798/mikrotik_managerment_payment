/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Interface = {
    id?: string;
    device_id?: string;
    name?: string;
    type?: Interface.type;
    mac?: string | null;
    parent_interface_id?: string | null;
    zone_id?: string | null;
    snmp_index?: number | null;
    speed_bps?: number | null;
    mtu?: number | null;
    admin_state?: Interface.admin_state;
    oper_state?: Interface.oper_state;
    accounting_group?: Interface.accounting_group;
    counted_in_reconciliation?: boolean;
    counter_source?: Interface.counter_source;
    created_at?: string;
    updated_at?: string;
};
export namespace Interface {
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
    export enum accounting_group {
        WAN_INPUT = 'WAN_INPUT',
        CREW_ACCESS = 'CREW_ACCESS',
        BUSINESS_ACCESS = 'BUSINESS_ACCESS',
        MANAGEMENT = 'MANAGEMENT',
        NONE = 'NONE',
    }
    export enum counter_source {
        UNKNOWN = 'UNKNOWN',
        SNMP = 'SNMP',
        API_POLL = 'API_POLL',
        IPFIX = 'IPFIX',
    }
}

