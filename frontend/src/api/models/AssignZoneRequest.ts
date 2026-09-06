/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * zone_id BAT BUOC khi accounting_group la CREW_ACCESS/BUSINESS_ACCESS/MANAGEMENT, va PHAI trong (WAN_INPUT khong gan zone_id, NONE khong gan zone_id). Vi pham -> VALIDATION_FAILED. Neu interface cha/con da dung cung accounting_group + counted_in_reconciliation=true -> 409 INTERFACE_DOUBLE_COUNT (ADR-10, kiem tra 1 cap truc tiep).
 */
export type AssignZoneRequest = {
    accounting_group: AssignZoneRequest.accounting_group;
    zone_id?: string | null;
    counted_in_reconciliation?: boolean;
};
export namespace AssignZoneRequest {
    export enum accounting_group {
        WAN_INPUT = 'WAN_INPUT',
        CREW_ACCESS = 'CREW_ACCESS',
        BUSINESS_ACCESS = 'BUSINESS_ACCESS',
        MANAGEMENT = 'MANAGEMENT',
        NONE = 'NONE',
    }
}

