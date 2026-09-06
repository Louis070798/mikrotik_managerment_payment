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
    created_at?: string;
    updated_at?: string;
};

