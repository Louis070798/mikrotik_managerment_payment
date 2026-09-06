/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ZoneCreateRequest = {
    kind: ZoneCreateRequest.kind;
    name: string;
    description?: string | null;
};
export namespace ZoneCreateRequest {
    export enum kind {
        CREW = 'CREW',
        BUSINESS = 'BUSINESS',
        MANAGEMENT = 'MANAGEMENT',
    }
}

