/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { DashboardPeriod } from './DashboardPeriod';
import type { DashboardUnits } from './DashboardUnits';
import type { GlobalReconciliationGaps } from './GlobalReconciliationGaps';
import type { GlobalReconciliationShipRow } from './GlobalReconciliationShipRow';
import type { GlobalReconciliationZoneBytes } from './GlobalReconciliationZoneBytes';
export type GlobalReconciliationResponse = {
    data?: {
        period?: DashboardPeriod;
        units?: DashboardUnits;
        data_status?: GlobalReconciliationResponse.data_status;
        formula_version?: string;
        /**
         * So tau THAT SU co it nhat 1 dong interface_counter_deltas trong khoang thoi gian nay (khong phai tong so tau trong inventory).
         */
        ship_count?: number;
        fleet?: {
            /**
             * "Tong data" toan ham doi = WAN download + upload cong lai cho ca ky.
             */
            total_bytes?: number | null;
            wan?: GlobalReconciliationZoneBytes;
            crew?: {
                port_download_bytes?: number | null;
                port_upload_bytes?: number | null;
                user_download_bytes?: number | null;
                user_upload_bytes?: number | null;
            };
            business?: GlobalReconciliationZoneBytes;
            management?: GlobalReconciliationZoneBytes;
            gaps?: GlobalReconciliationGaps;
        };
        ships?: Array<GlobalReconciliationShipRow>;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace GlobalReconciliationResponse {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
    }
}

