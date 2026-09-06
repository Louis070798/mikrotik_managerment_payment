/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DashboardPeriod } from './DashboardPeriod';
import type { DashboardUnits } from './DashboardUnits';
/**
 * Bandwidth theo bucket + tong data THEO TUNG INTERFACE (khac DeviceTraffic chi gop theo 4 nhom WAN/CREW/BUSINESS/MANAGEMENT). month_total reset tu nhien vao 00:00 UTC ngay 1 hang thang -- tinh tu dau thang UTC hien tai den luc goi API, khong phai gia tri luu san bi reset boi cron.
 */
export type DeviceInterfaceTraffic = {
    device_id?: string;
    period?: DashboardPeriod;
    units?: DashboardUnits;
    data_status?: DeviceInterfaceTraffic.data_status;
    interfaces?: Array<{
        interface_id?: string;
        name?: string;
        accounting_group?: 'WAN_INPUT' | 'CREW_ACCESS' | 'BUSINESS_ACCESS' | 'MANAGEMENT' | 'NONE';
        points?: Array<{
            bucket?: string;
            rx_bytes?: number;
            tx_bytes?: number;
        }>;
        /**
         * Tong cong don tu 00:00 UTC ngay 1 cua thang hien tai den luc goi API -- null neu interface nay chua co delta nao trong thang.
         */
        month_total?: {
            from?: string;
            to?: string;
            rx_bytes?: number | null;
            tx_bytes?: number | null;
            total_bytes?: number | null;
        };
        /**
         * Nguyen van payload MikroTik gui lan gan nhat (counter CONG DON tu luc router boot, khong phai delta) -- packets/errors/drops chi khac null khi router thuc su gui truong do.
         */
        latest_sample?: {
            observed_at?: string;
            rx_bytes?: number;
            tx_bytes?: number;
            rx_packets?: number | null;
            tx_packets?: number | null;
            rx_errors?: number | null;
            tx_errors?: number | null;
            rx_drops?: number | null;
            tx_drops?: number | null;
        } | null;
    }>;
    /**
     * Thong tin router tu bao o lan push gan nhat -- null neu chua tung nhan push nao.
     */
    last_push?: {
        /**
         * source_device_ref cua raw_telemetry_events gan nhat -- vd /system identity name MikroTik tu goi len.
         */
        identity?: string | null;
        received_at?: string;
    } | null;
};
export namespace DeviceInterfaceTraffic {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

