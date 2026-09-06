/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ZeroTierDns } from './ZeroTierDns';
import type { ZeroTierIpAssignmentPool } from './ZeroTierIpAssignmentPool';
import type { ZeroTierNetworkSummary } from './ZeroTierNetworkSummary';
import type { ZeroTierRoute } from './ZeroTierRoute';
export type ZeroTierNetworkDetail = (ZeroTierNetworkSummary & {
    /**
     * v4AssignMode.zt that tu controller -- null neu thieu field.
     */
    auto_assign_v4?: boolean | null;
    ip_assignment_pools?: Array<ZeroTierIpAssignmentPool>;
    routes?: Array<ZeroTierRoute>;
    dns?: ZeroTierDns | null;
});

