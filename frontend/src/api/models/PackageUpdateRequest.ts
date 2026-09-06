/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PackageUpdateRequest = {
    name?: string;
    down_mbps?: number;
    up_mbps?: number;
    quota_gb?: number;
    duration_unit?: PackageUpdateRequest.duration_unit;
    duration_value?: number;
    price_vnd?: number;
    max_concurrent_devices?: number;
};
export namespace PackageUpdateRequest {
    export enum duration_unit {
        DAY = 'DAY',
        MONTH = 'MONTH',
    }
}

