/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DashboardPeriod } from './DashboardPeriod';
import type { DashboardUnits } from './DashboardUnits';
/**
 * WAN total va rate theo bucket cho mot thiet bi, tu interface_counter_deltas (WAN_INPUT). data_status INSUFFICIENT_DATA khi chua co delta nao -- khong phai loi, chi la chua co telemetry.
 */
export type DeviceTraffic = {
    device_id?: string;
    period?: DashboardPeriod;
    units?: DashboardUnits;
    data_status?: DeviceTraffic.data_status;
    /**
     * Tong download/upload WAN trong ca khoang period (khong phai 1 bucket).
     */
    wan?: {
        download_bytes?: number | null;
        upload_bytes?: number | null;
    };
    /**
     * Doi soat tong data thuc te da len server qua WAN so voi tong da gan nhan CREW/BUSINESS/MANAGEMENT trong cung khoang thoi gian -- cung cong thuc computeGap() dung o Reconciliation cap tau, loc theo device_id. gap duong nghia la co traffic WAN chua duoc gan vao interface nao (con NONE), khong phai loi he thong.
     */
    reconciliation?: {
        /**
         * Tong CREW_ACCESS + BUSINESS_ACCESS + MANAGEMENT da dem duoc -- null neu chua co interface nao trong 3 nhom nay co delta.
         */
        counted?: {
            download_bytes?: number | null;
            upload_bytes?: number | null;
        };
        /**
         * gap = wan - counted. Duong = con traffic WAN chua gan nhom; am (hiem) = counted vuot wan (vd loi dem 2 lan).
         */
        gap?: {
            download_bytes?: number | null;
            download_pct?: number | null;
            upload_bytes?: number | null;
            upload_pct?: number | null;
        };
    };
    points?: Array<{
        bucket?: string;
        wan?: {
            download_bytes?: number;
            upload_bytes?: number;
        } | null;
        crew?: {
            download_bytes?: number;
            upload_bytes?: number;
        } | null;
        business?: {
            download_bytes?: number;
            upload_bytes?: number;
        } | null;
        management?: {
            download_bytes?: number;
            upload_bytes?: number;
        } | null;
    }>;
};
export namespace DeviceTraffic {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

