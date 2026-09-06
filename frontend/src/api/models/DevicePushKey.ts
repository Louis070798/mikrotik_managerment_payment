/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Ket qua cap/thu hoi push API key. api_key la key THAT, chi tra ve DUY NHAT 1 LAN trong response cua POST -- server chi luu sha256(api_key), khong doc lai duoc sau do.
 */
export type DevicePushKey = {
    /**
     * Key that (hex, 64 ky tu) -- dan vao script RouterOS ngay, se KHONG hien lai.
     */
    api_key?: string;
    issued_at?: string;
};

