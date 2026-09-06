/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GlobalFinanceResponse } from '../models/GlobalFinanceResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class FinanceService {
    /**
     * Bao cao tai chinh toan ham doi
     * Gia tri cac goi cuoc dang ACTIVE theo gia niem yet (packages.price_vnd) -- KHONG phai doanh thu da thu, he thong chua co bang hoa don/thanh toan. Gom: tong gia tri + so subscriber dang active, phan bo theo trang thai (active/suspended/expired), sap het han trong N ngay (co gia tri "at risk"), va breakdown theo goi/tau/dai ly (tenant).
     * @returns GlobalFinanceResponse OK
     * @throws ApiError
     */
    public static getDashboardGlobalFinance({
        expiringWithinDays = 30,
    }: {
        /**
         * So ngay tinh tu bay gio de gom cac subscriber ACTIVE sap den expires_at vao "expiring_soon".
         */
        expiringWithinDays?: number,
    }): CancelablePromise<GlobalFinanceResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/dashboard/global/finance',
            query: {
                'expiring_within_days': expiringWithinDays,
            },
            errors: {
                403: `FORBIDDEN`,
            },
        });
    }
}
