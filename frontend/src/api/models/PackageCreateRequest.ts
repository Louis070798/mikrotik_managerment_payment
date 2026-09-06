/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PackageCreateRequest = {
    tenant_id?: string | null;
    name: string;
    down_mbps: number;
    up_mbps: number;
    quota_gb: number;
    duration_unit: PackageCreateRequest.duration_unit;
    duration_value: number;
    price_vnd: number;
    max_concurrent_devices?: number;
};
export namespace PackageCreateRequest {
    export enum duration_unit {
        DAY = 'DAY',
        MONTH = 'MONTH',
    }
}

