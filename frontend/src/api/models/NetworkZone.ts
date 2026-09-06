/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Vung logic tren mot tau. accounting_group cua interface duoc anh xa vao 1 trong 4 nhom bat buoc: WAN (accounting_group=WAN_INPUT, khong gan zone_id) hoac CREW/BUSINESS/MANAGEMENT (bat buoc gan zone_id cua dung kind).
 */
export type NetworkZone = {
    id?: string;
    ship_id?: string;
    kind?: NetworkZone.kind;
    name?: string;
    description?: string | null;
};
export namespace NetworkZone {
    export enum kind {
        CREW = 'CREW',
        BUSINESS = 'BUSINESS',
        MANAGEMENT = 'MANAGEMENT',
    }
}

