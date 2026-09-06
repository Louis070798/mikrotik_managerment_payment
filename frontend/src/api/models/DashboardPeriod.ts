/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type DashboardPeriod = {
    from: string;
    to: string;
    granularity: DashboardPeriod.granularity;
    timezone: string;
};
export namespace DashboardPeriod {
    export enum granularity {
        _1M = '1m',
        _5M = '5m',
        _1H = '1h',
        _1D = '1d',
    }
}

