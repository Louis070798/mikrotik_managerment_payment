/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ZeroTierDns } from './ZeroTierDns';
import type { ZeroTierIpAssignmentPool } from './ZeroTierIpAssignmentPool';
import type { ZeroTierRoute } from './ZeroTierRoute';
export type ZeroTierUpdateNetworkRequest = {
    name?: string;
    private?: boolean;
    /**
     * Bat/tat tu dong cap IPv4 (v4AssignMode.zt). Tat thi phai tu gan IP tay qua PATCH member.
     */
    auto_assign_v4?: boolean;
    ip_assignment_pools?: Array<ZeroTierIpAssignmentPool>;
    routes?: Array<ZeroTierRoute>;
    dns?: ZeroTierDns | null;
};

