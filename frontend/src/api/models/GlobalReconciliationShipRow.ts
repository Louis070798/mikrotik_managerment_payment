/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 1 dong / tau, mang da sap san theo |wan_download_gap_pct| giam dan (tau lech nhieu nhat len dau).
 */
export type GlobalReconciliationShipRow = {
    ship_id?: string;
    ship_code?: string;
    ship_name?: string;
    wan_download_bytes?: number | null;
    wan_upload_bytes?: number | null;
    /**
     * Tong CREW+BUSINESS+MANAGEMENT download cua tau nay.
     */
    counted_download_bytes?: number | null;
    counted_upload_bytes?: number | null;
    wan_download_gap_bytes?: number | null;
    wan_download_gap_pct?: number | null;
    wan_upload_gap_bytes?: number | null;
    wan_upload_gap_pct?: number | null;
};

