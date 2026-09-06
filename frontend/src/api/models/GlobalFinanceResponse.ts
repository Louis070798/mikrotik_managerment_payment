/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { GlobalFinanceByPackageRow } from './GlobalFinanceByPackageRow';
import type { GlobalFinanceByShipRow } from './GlobalFinanceByShipRow';
import type { GlobalFinanceByTenantRow } from './GlobalFinanceByTenantRow';
export type GlobalFinanceResponse = {
    data?: {
        as_of?: string;
        currency?: GlobalFinanceResponse.currency;
        totals?: {
            active_subscription_count?: number;
            /**
             * Tong gia_vnd cac goi dang ACTIVE theo gia niem yet -- KHONG phai doanh thu da thu (he thong chua luu hoa don/thanh toan).
             */
            active_subscription_value_vnd?: number;
        };
        status_breakdown?: {
            active?: number;
            suspended?: number;
            expired?: number;
        };
        expiring_soon?: {
            within_days?: number;
            count?: number;
            at_risk_value_vnd?: number;
        };
        by_package?: Array<GlobalFinanceByPackageRow>;
        by_ship?: Array<GlobalFinanceByShipRow>;
        by_tenant?: Array<GlobalFinanceByTenantRow>;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace GlobalFinanceResponse {
    export enum currency {
        VND = 'VND',
    }
}

