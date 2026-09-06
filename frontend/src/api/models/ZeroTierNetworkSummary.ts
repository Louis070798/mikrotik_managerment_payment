/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ZeroTierNetworkSummary = {
    /**
     * Network ID that (16 ky tu hex).
     */
    id?: string;
    name?: string | null;
    private?: boolean | null;
    /**
     * Dem that tu GET /controller/network/{id}/member.
     */
    member_count?: number;
    /**
     * Null neu controller khong tra field nay (khong phai moi ban ZeroTier deu co) -- trung thuc, khong tu dem bang N+1 goi member.
     */
    authorized_member_count?: number | null;
};

