/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ZeroTierUpdateMemberRequest = {
    authorized?: boolean;
    /**
     * Gan IP tay -- server tu kem noAutoAssignIps=true khi gui field nay (xem mo ta PATCH member).
     */
    ip_assignments?: Array<string>;
    /**
     * Ten hien thi luu rieng o he thong nay (zerotierMemberLabels) -- controller that khong co field nay. Chuoi rong/null = xoa ten da dat.
     */
    name?: string | null;
};

