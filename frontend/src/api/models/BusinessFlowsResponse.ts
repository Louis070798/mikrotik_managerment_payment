/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseMeta } from './BaseMeta';
import type { DashboardPeriod } from './DashboardPeriod';
import type { IdentityCapability } from './IdentityCapability';
import type { ModuleDataQuality } from './ModuleDataQuality';
export type BusinessFlowsResponse = {
    data?: {
        period?: DashboardPeriod;
        units?: Record<string, any>;
        source?: string;
        data_status?: BusinessFlowsResponse.data_status;
        data_quality?: ModuleDataQuality;
        total_bytes?: number | null;
        flow_count?: number;
        /**
         * DNS when at least 1 flow in this period was matched to a resolved domain via the DNS log collector; UNKNOWN when none were (IP/ASN/TLS-SNI classifiers are not implemented — see unknown_reason).
         */
        classification_method?: BusinessFlowsResponse.classification_method;
        unknown_reason?: string | null;
        /**
         * total_bytes minus the bytes covered by by_app — i.e. bytes with no matching DNS record (classification_method=UNKNOWN at the flow level).
         */
        unattributed_bytes?: number | null;
        top_destinations?: Array<{
            dst_ip?: string;
            bytes?: number;
            flow_count?: number;
        }>;
        /**
         * Bytes grouped by cataloged service name (service-catalog.ts) for DNS-classified flows only; a domain with no catalog match is grouped under "Khác" rather than dropped.
         */
        by_app?: Array<{
            app?: string;
            bytes?: number;
            flow_count?: number;
        }>;
        /**
         * Top 10 DNS-resolved domains by bytes for this ship/period, regardless of service catalog match.
         */
        by_domain?: Array<{
            domain?: string;
            bytes?: number;
            flow_count?: number;
        }>;
        identity_capability?: IdentityCapability;
    };
    meta?: BaseMeta;
    error?: any;
};
export namespace BusinessFlowsResponse {
    export enum data_status {
        AVAILABLE = 'AVAILABLE',
        INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    }
    /**
     * DNS when at least 1 flow in this period was matched to a resolved domain via the DNS log collector; UNKNOWN when none were (IP/ASN/TLS-SNI classifiers are not implemented — see unknown_reason).
     */
    export enum classification_method {
        UNKNOWN = 'UNKNOWN',
        DNS = 'DNS',
    }
}

