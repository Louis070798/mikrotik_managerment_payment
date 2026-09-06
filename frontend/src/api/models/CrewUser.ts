/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { IdentityCapability } from './IdentityCapability';
export type CrewUser = {
    username?: string;
    status?: CrewUser.status;
    sessions_count?: number;
    /**
     * Number of RADIUS sessions overlapping the period (interpreted as login/access count).
     */
    access_count?: number;
    download_bytes?: number | null;
    upload_bytes?: number | null;
    total_bytes?: number | null;
    last_seen_at?: string | null;
    /**
     * Array of {app, bytes} summed from ipfix_flow_records for this user/period, DNS-classified (see classification_method) — only includes flows matched to a cataloged service. Empty array (not null) when the classifier is available but no classified traffic was found for this user; see service_usage_capability for the ship-level availability signal.
     */
    service_usage?: any;
    /**
     * Array of {domain, bytes} (top 20 by bytes) summed from ipfix_flow_records for this user/period, for any DNS-resolved domain regardless of service catalog match. Empty array (not null) when the classifier is available but no classified traffic was found for this user.
     */
    domain_usage?: any;
    identity_capability?: IdentityCapability;
    /**
     * Goi cuoc that cua subscriber tuong ung (subscribers.package_id) -- null neu username nay chi thay trong RADIUS session, khong co (hoac da xoa) subscriber tuong ung.
     */
    package?: {
        id?: string;
        name?: string;
        quota_gb?: number;
        down_mbps?: number;
        up_mbps?: number;
        price_vnd?: number;
    } | null;
    /**
     * Trang thai subscriber that (khac voi "status" o tren -- do la trang thai phien RADIUS trong ky, con day la trang thai tai khoan). Null neu khong co subscriber tuong ung.
     */
    subscription_status?: CrewUser.subscription_status | null;
    /**
     * Tong quota da dung TU TRUOC TOI NAY (subscribers.quota_used_bytes, khong gioi han theo ky dang xem) -- khac voi total_bytes o tren (chi tinh trong ky).
     */
    quota_used_bytes?: number | null;
    expires_at?: string | null;
};
export namespace CrewUser {
    export enum status {
        ACTIVE = 'ACTIVE',
        STALE = 'STALE',
        INACTIVE = 'INACTIVE',
    }
    /**
     * Trang thai subscriber that (khac voi "status" o tren -- do la trang thai phien RADIUS trong ky, con day la trang thai tai khoan). Null neu khong co subscriber tuong ung.
     */
    export enum subscription_status {
        ACTIVE = 'ACTIVE',
        SUSPENDED = 'SUSPENDED',
        EXPIRED = 'EXPIRED',
    }
}

