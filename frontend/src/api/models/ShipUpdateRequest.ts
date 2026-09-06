/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Tat ca field optional (partial update). Khong doi duoc area_id qua endpoint nay.
 */
export type ShipUpdateRequest = {
    /**
     * Dai ly/cong ty quan ly tau nay (tenants.id) -- tuy chon, khong bat buoc.
     */
    tenant_id?: string | null;
    code?: string;
    name?: string;
    status?: ShipUpdateRequest.status;
    timezone?: string;
    imo?: string | null;
    mmsi?: string | null;
    crew_capacity?: number | null;
};
export namespace ShipUpdateRequest {
    export enum status {
        PLANNED = 'PLANNED',
        COMMISSIONING = 'COMMISSIONING',
        ACTIVE = 'ACTIVE',
        MAINTENANCE = 'MAINTENANCE',
        DECOMMISSIONED = 'DECOMMISSIONED',
    }
}

