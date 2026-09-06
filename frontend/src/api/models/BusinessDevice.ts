/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { IdentityCapability } from './IdentityCapability';
export type BusinessDevice = {
    ip?: string;
    mac?: string | null;
    vlan_id?: number | null;
    /**
     * Always null in this phase — direction split is not derivable from a single-leg IPFIX byte counter without ingress/egress interface pairing.
     */
    download_bytes?: number | null;
    upload_bytes?: number | null;
    total_bytes?: number | null;
    flow_count?: number;
    first_seen_at?: string;
    last_seen_at?: string;
    identity_capability?: IdentityCapability;
};

