/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ShipItem = {
    id?: string;
    name?: string;
    area_id?: string;
    /**
     * Dai ly/cong ty quan ly tau nay (tenants.id) -- tuy chon, khong bat buoc.
     */
    tenant_id?: string | null;
    status?: ShipItem.status;
    code?: string;
    device_count?: number;
};
export namespace ShipItem {
    export enum status {
        PLANNED = 'PLANNED',
        COMMISSIONING = 'COMMISSIONING',
        ACTIVE = 'ACTIVE',
        MAINTENANCE = 'MAINTENANCE',
        DECOMMISSIONED = 'DECOMMISSIONED',
    }
}

