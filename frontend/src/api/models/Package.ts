/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Goi cuoc. tenant_id null = goi dung chung cho moi tenant (ke thua).
 */
export type Package = {
    id?: string;
    tenant_id?: string | null;
    name?: string;
    down_mbps?: number;
    up_mbps?: number;
    /**
     * Khong co goi "khong gioi han" -- luon la so cu the.
     */
    quota_gb?: number;
    duration_unit?: Package.duration_unit;
    duration_value?: number;
    price_vnd?: number;
    max_concurrent_devices?: number;
    /**
     * So subscriber dang gan goi nay (tinh o server, khong phai field luu trong DB)
     */
    subscriber_count?: number;
    created_at?: string;
    updated_at?: string;
};
export namespace Package {
    export enum duration_unit {
        DAY = 'DAY',
        MONTH = 'MONTH',
    }
}

