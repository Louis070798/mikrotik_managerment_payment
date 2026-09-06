/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type BaseMeta = {
    request_id?: string;
    generated_at?: string;
    data_from?: string;
    data_to?: string;
    data_freshness_seconds?: number | null;
    freshness_by_source?: Record<string, number | null>;
    /**
     * Chi xuat hien tren cac endpoint list co phan trang (cursor hoac offset).
     */
    page?: {
        limit?: number;
        offset?: number;
        total?: number;
        cursor_next?: string | null;
        has_more?: boolean;
    } | null;
    warnings?: Array<{
        code?: string;
        message?: string;
        details?: Record<string, any>;
    }> | null;
};

