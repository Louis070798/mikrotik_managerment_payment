/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShipItem } from './ShipItem';
export type ShipDetail = (ShipItem & {
    timezone?: string;
    imo?: string | null;
    mmsi?: string | null;
    crew_capacity?: number | null;
    commissioned_at?: string | null;
    created_at?: string;
    updated_at?: string;
});

