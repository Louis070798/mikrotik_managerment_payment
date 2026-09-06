/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Ket qua cap/thu hoi RADIUS secret. secret la gia tri THAT, chi tra ve DUY NHAT 1 LAN trong response cua POST -- server khong luu lai/log lai sau do (di qua EnvSecretStore, xem ADR-05).
 */
export type DeviceRadiusSecret = {
    /**
     * Con tro da tu dong gan vao devices.credential_ref, dang "env:TEN_BIEN" -- day la gia tri AN TOAN de hien thi lai (khong phai secret that).
     */
    credential_ref?: string;
    /**
     * Secret that (hex, 48 ky tu) -- dan vao "/radius add ... secret=..." tren router ngay, se KHONG hien lai.
     */
    secret?: string;
    issued_at?: string;
};

