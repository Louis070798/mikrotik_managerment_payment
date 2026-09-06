/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Shared by CREW and BUSINESS responses (mirrors DataQuality used by dashboard/reconciliation).
 */
export type ModuleDataQuality = {
    score: number | null;
    status: ModuleDataQuality.status;
    missing_sources: Array<string>;
};
export namespace ModuleDataQuality {
    export enum status {
        AVAILABLE = 'AVAILABLE',
        PARTIAL = 'PARTIAL',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
}

