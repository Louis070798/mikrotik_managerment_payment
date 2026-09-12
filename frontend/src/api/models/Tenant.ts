/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Tenant/dai ly phan cap (nha cung cap -> cong ty/dai ly -> chi nhanh). parent_id null = tenant goc.
 */
export type Tenant = {
    id?: string;
    parent_id?: string | null;
    code?: string;
    name?: string;
    contact_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    address?: string | null;
    tax_id?: string | null;
    /**
     * Ten dang nhap that cua tenant (tu sinh tu code khi cap mat khau lan dau) -- null neu chua tung cap mat khau.
     */
    username?: string | null;
    /**
     * True neu tenant nay da co mat khau dang nhap that (xem POST .../password).
     */
    password_configured?: boolean;
    password_issued_at?: string | null;
    created_at?: string;
    updated_at?: string;
};

