/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { SettingsResponse } from '../models/SettingsResponse';
import type { SettingsUpdateRequest } from '../models/SettingsUpdateRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SettingsService {
    /**
     * Xem cau hinh Tier-0 hien tai (database, cong RADIUS/NetFlow/DNS, ZeroTier token)
     * Doc truc tiep tu .env hien hanh (khong qua DB) -- hoat dong duoc ke ca khi database dang mat ket noi. Mat khau/token khong bao gio tra ve, chi co *_configured (boolean).
     * @returns SettingsResponse OK
     * @throws ApiError
     */
    public static getSettings(): CancelablePromise<SettingsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/settings',
            errors: {
                403: `FORBIDDEN`,
            },
        });
    }
    /**
     * Sua cau hinh Tier-0 (ghi xuong .env, can restart backend de ap dung)
     * Chi sua cac bien Tier-0 dong bang da co san trong env.schema.ts (ADR-04) -- KHONG tao bien moi. Ghi xuong file .env cua backend + audit_logs (best-effort, khong chan neu DB dang mat ket noi -- dung de sua chinh loi ket noi DB). Tra restart_required=true neu co thay doi.
     * @returns SettingsResponse OK
     * @throws ApiError
     */
    public static patchSettings({
        requestBody,
    }: {
        requestBody: SettingsUpdateRequest,
    }): CancelablePromise<SettingsResponse> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/settings',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN`,
            },
        });
    }
}
