/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ShipCreateRequest = {
    area_id: string;
    /**
     * Dai ly/cong ty quan ly tau nay (tenants.id) -- tuy chon, khong bat buoc.
     */
    tenant_id?: string | null;
    code: string;
    name: string;
    status?: ShipCreateRequest.status;
    timezone?: string;
    imo?: string | null;
    mmsi?: string | null;
    crew_capacity?: number | null;
};
export namespace ShipCreateRequest {
    export enum status {
        PLANNED = 'PLANNED',
        COMMISSIONING = 'COMMISSIONING',
        ACTIVE = 'ACTIVE',
        MAINTENANCE = 'MAINTENANCE',
        DECOMMISSIONED = 'DECOMMISSIONED',
    }
}

