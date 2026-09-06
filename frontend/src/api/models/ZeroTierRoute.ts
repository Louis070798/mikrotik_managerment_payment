/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ZeroTierRoute = {
    /**
     * Subnet CIDR (vd 172.30.139.0/24).
     */
    target: string;
    /**
     * Gateway IP -- null neu day la route noi bo (khong qua gateway).
     */
    via?: string | null;
};

