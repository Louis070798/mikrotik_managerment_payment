/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Body ma chinh MikroTik tu gui len (POST /devices/{deviceId}/telemetry-push, header X-Device-Api-Key thay cho x-actor-permissions) -- model push 1 chieu, scheduler RouterOS chay moi 5 phut.
 */
export type DeviceTelemetryPushRequest = {
    /**
     * Nhan dien thiet bi phia nguon (vd /system identity print), tuy chon.
     */
    identity?: string | null;
    /**
     * IP nguon cua router luc gui -- neu co, server tu cap nhat devices.ip_address.
     */
    ip_address?: string | null;
    interfaces: Array<{
        /**
         * Ten interface dung nhu tren thiet bi (vd ether1) -- normalize resolve theo (device_id, name).
         */
        name: string;
        rx_byte: number;
        tx_byte: number;
        rx_packet?: number | null;
        tx_packet?: number | null;
        rx_error?: number | null;
        tx_error?: number | null;
    }>;
};

