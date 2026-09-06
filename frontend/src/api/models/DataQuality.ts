/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type DataQuality = {
    score: number | null;
    status: DataQuality.status;
    missing_sources: Array<string>;
    counter_resets?: number | null;
    missing_buckets?: number | null;
};
export namespace DataQuality {
    export enum status {
        AVAILABLE = 'AVAILABLE',
        PARTIAL = 'PARTIAL',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

