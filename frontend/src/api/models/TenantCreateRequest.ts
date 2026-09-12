/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TenantCreateRequest = {
    parent_id?: string | null;
    code: string;
    name: string;
    /**
     * Mat khau dang nhap that -- ADMIN TU GO khi tao tenant (khong con tu sinh ngau nhien). Server chi luu ban bam (scrypt), khong bao gio tra lai qua GET/PATCH.
     */
    password: string;
    contact_name?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    address?: string | null;
    tax_id?: string | null;
};

