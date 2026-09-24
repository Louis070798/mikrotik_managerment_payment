/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Shared secret RADIUS o dang plaintext -- chi tra qua GET /devices/{deviceId}/radius-secret, moi lan doc deu ghi audit device.radius_secret_reveal.
 */
export type DeviceRadiusSecretValue = {
    /**
     * Gia tri dan nguyen van vao "/radius add secret=..." tren MikroTik.
     */
    secret?: string;
    /**
     * Nguon gia tri -- "enc" la credential_ref ma hoa AES-256-GCM (luong chuan), "env" la kieu cu tro toi 1 bien moi truong.
     */
    scheme?: DeviceRadiusSecretValue.scheme;
    issued_at?: string | null;
    /**
     * devices.ip_address -- server nhan dien NAS BANG DIA CHI NGUON cua goi UDP, nen router phai gui goi RADIUS di tu dung IP nay hoac moi goi se bi bo im lang.
     */
    nas_ip_address?: string | null;
};
export namespace DeviceRadiusSecretValue {
    /**
     * Nguon gia tri -- "enc" la credential_ref ma hoa AES-256-GCM (luong chuan), "env" la kieu cu tro toi 1 bien moi truong.
     */
    export enum scheme {
        ENC = 'enc',
        ENV = 'env',
    }
}

