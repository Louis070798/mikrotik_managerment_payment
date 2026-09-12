/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AreaCreateRequest } from '../models/AreaCreateRequest';
import type { AreaDetail } from '../models/AreaDetail';
import type { AreaUpdateRequest } from '../models/AreaUpdateRequest';
import type { BaseMeta } from '../models/BaseMeta';
import type { Device } from '../models/Device';
import type { DeviceCreateRequest } from '../models/DeviceCreateRequest';
import type { DeviceInterfaceTraffic } from '../models/DeviceInterfaceTraffic';
import type { DevicePushKey } from '../models/DevicePushKey';
import type { DeviceRadiusSecret } from '../models/DeviceRadiusSecret';
import type { DeviceTelemetryPushRequest } from '../models/DeviceTelemetryPushRequest';
import type { DeviceTelemetryPushResult } from '../models/DeviceTelemetryPushResult';
import type { DeviceTraffic } from '../models/DeviceTraffic';
import type { DeviceUpdateRequest } from '../models/DeviceUpdateRequest';
import type { ErrorDetails } from '../models/ErrorDetails';
import type { ShipCreateRequest } from '../models/ShipCreateRequest';
import type { ShipDetail } from '../models/ShipDetail';
import type { ShipUpdateRequest } from '../models/ShipUpdateRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class InventoryService {
    /**
     * Create area
     * @returns any Created
     * @throws ApiError
     */
    public static postAreas({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: AreaCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: AreaDetail;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/areas',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Create ship
     * @returns any Created
     * @throws ApiError
     */
    public static postShips({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: ShipCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ShipDetail;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/ships',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `AREA_NOT_FOUND`,
            },
        });
    }
    /**
     * Get area detail
     * @returns any OK
     * @throws ApiError
     */
    public static getAreas({
        areaId,
        xActorPermissions,
    }: {
        areaId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: AreaDetail;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/areas/{areaId}',
            path: {
                'areaId': areaId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Update area
     * @returns any Updated
     * @throws ApiError
     */
    public static patchAreas({
        areaId,
        requestBody,
        xActorPermissions,
    }: {
        areaId: string,
        requestBody: AreaUpdateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: AreaDetail;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/areas/{areaId}',
            path: {
                'areaId': areaId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Delete area (soft delete, chan neu con ship)
     * @returns void
     * @throws ApiError
     */
    public static deleteAreas({
        areaId,
        xActorPermissions,
    }: {
        areaId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/areas/{areaId}',
            path: {
                'areaId': areaId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
                409: `AREA_HAS_SHIPS -- area con ship, phai xoa/chuyen ship truoc`,
            },
        });
    }
    /**
     * Get ship detail
     * @returns any OK
     * @throws ApiError
     */
    public static getShips({
        shipId,
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ShipDetail;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/ships/{shipId}',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Update ship
     * @returns any Updated
     * @throws ApiError
     */
    public static patchShips({
        shipId,
        requestBody,
        xActorPermissions,
    }: {
        shipId: string,
        requestBody: ShipUpdateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: ShipDetail;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/ships/{shipId}',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Delete ship (soft delete, chan neu con device)
     * @returns void
     * @throws ApiError
     */
    public static deleteShips({
        shipId,
        xActorPermissions,
    }: {
        shipId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/ships/{shipId}',
            path: {
                'shipId': shipId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
                409: `SHIP_HAS_DEVICES -- ship con device, phai xoa/chuyen device truoc`,
            },
        });
    }
    /**
     * List devices
     * @returns any OK
     * @throws ApiError
     */
    public static getDevices({
        xActorPermissions,
        shipId,
        role,
        status,
    }: {
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        shipId?: string,
        role?: 'EDGE' | 'CORE' | 'SWITCH' | 'AP' | 'CPE',
        status?: 'UNKNOWN' | 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE',
    }): CancelablePromise<{
        data?: Array<Device>;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/devices',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'ship_id': shipId,
                'role': role,
                'status': status,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
            },
        });
    }
    /**
     * Create device
     * @returns any Created
     * @throws ApiError
     */
    public static postDevices({
        requestBody,
        xActorPermissions,
    }: {
        requestBody: DeviceCreateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Device;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/devices',
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `SHIP_NOT_FOUND`,
                409: `RESOURCE_CONFLICT (trung ma thiet bi trong cung 1 tau) hoac SHIP_ALREADY_HAS_DEVICE (tau da co san 1 thiet bi -- moi tau chi duoc gan dung 1 Smartbox)`,
            },
        });
    }
    /**
     * Get device detail
     * @returns any OK
     * @throws ApiError
     */
    public static getDevices1({
        deviceId,
        xActorPermissions,
    }: {
        deviceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Device;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/devices/{deviceId}',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Update device
     * @returns any Updated
     * @throws ApiError
     */
    public static patchDevices({
        deviceId,
        requestBody,
        xActorPermissions,
    }: {
        deviceId: string,
        requestBody: DeviceUpdateRequest,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: Device;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/devices/{deviceId}',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Delete device (soft delete)
     * @returns void
     * @throws ApiError
     */
    public static deleteDevices({
        deviceId,
        xActorPermissions,
    }: {
        deviceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/devices/{deviceId}',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Traffic theo bucket cho mot thiet bi (WAN total + interface rate theo thoi gian)
     * Tra 200 kem data_status INSUFFICIENT_DATA khi chua co interface_counter_deltas nao cho thiet bi nay, khong throw loi -- giong ho Global/Area/Ship Dashboard, khac Reconciliation.
     * @returns any OK
     * @throws ApiError
     */
    public static getDevicesTraffic({
        deviceId,
        xActorPermissions,
        from,
        to,
        timezone,
        granularity = '1h',
    }: {
        deviceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        /**
         * RFC3339 period start. Defaults to 24 hours before `to`.
         */
        from?: string,
        /**
         * RFC3339 period end. Defaults to now.
         */
        to?: string,
        /**
         * IANA timezone used for period bucketing.
         */
        timezone?: string,
        granularity?: '1m' | '5m' | '1h' | '1d',
    }): CancelablePromise<{
        data?: DeviceTraffic;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/devices/{deviceId}/traffic',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Bandwidth + tong data THEO TUNG INTERFACE cho mot thiet bi
     * Khac GET .../traffic (chi gop theo 4 nhom WAN/CREW/BUSINESS/MANAGEMENT) -- endpoint nay tra ve tung interface rieng de ve 1 bieu do bandwidth nhieu duong + tong data/interface. month_total reset tu nhien vao 00:00 UTC ngay 1 hang thang (tinh tu dau thang UTC den hien tai, khong phai gia tri cache bi cron xoa).
     * @returns any OK
     * @throws ApiError
     */
    public static getDevicesInterfacesTraffic({
        deviceId,
        xActorPermissions,
        from,
        to,
        timezone,
        granularity = '1h',
    }: {
        deviceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
        /**
         * RFC3339 period start. Defaults to 24 hours before `to`.
         */
        from?: string,
        /**
         * RFC3339 period end. Defaults to now.
         */
        to?: string,
        /**
         * IANA timezone used for period bucketing.
         */
        timezone?: string,
        granularity?: '1m' | '5m' | '1h' | '1d',
    }): CancelablePromise<{
        data?: DeviceInterfaceTraffic;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/devices/{deviceId}/interfaces/traffic',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            query: {
                'from': from,
                'to': to,
                'timezone': timezone,
                'granularity': granularity,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Cap push API key moi cho thiet bi (model push 1 chieu)
     * Sinh key that ngau nhien, luu sha256(key) vao devices.api_key_hash, tra key that mot lan duy nhat trong response. Cap lai se vo hieu key cu ngay lap tuc.
     * @returns any Created
     * @throws ApiError
     */
    public static postDevicesPushKey({
        deviceId,
        xActorPermissions,
    }: {
        deviceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: DevicePushKey;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/devices/{deviceId}/push-key',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Thu hoi push API key cua thiet bi
     * Xoa api_key_hash/api_key_issued_at -- lan push ke tiep bang key cu se nhan DEVICE_PUSH_NOT_CONFIGURED (409).
     * @returns void
     * @throws ApiError
     */
    public static deleteDevicesPushKey({
        deviceId,
        xActorPermissions,
    }: {
        deviceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/devices/{deviceId}/push-key',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Cap RADIUS secret moi cho thiet bi
     * Sinh secret that ngau nhien qua EnvSecretStore (TAM THOI, ADR-05 -- xem backend/src/libs/secrets), tu dat credential_ref tro toi bien vua tao, thu hoi bien cu neu co. Secret that tra ve DUY NHAT 1 LAN trong response nay; RADIUS Accounting-Request ke tiep tu router dung duoc ngay khong can restart server.
     * @returns any Created
     * @throws ApiError
     */
    public static postDevicesRadiusSecret({
        deviceId,
        xActorPermissions,
    }: {
        deviceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<{
        data?: DeviceRadiusSecret;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/devices/{deviceId}/radius-secret',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * Thu hoi RADIUS secret cua thiet bi
     * Xoa credential_ref/radius_secret_issued_at va bien env tuong ung -- goi Accounting-Request ke tiep tu router dung secret cu se bi RADIUS server tu choi (khong xac thuc duoc Request Authenticator).
     * @returns void
     * @throws ApiError
     */
    public static deleteDevicesRadiusSecret({
        deviceId,
        xActorPermissions,
    }: {
        deviceId: string,
        /**
         * TAM THOI (AuthStubGuard, chua phai Auth/RBAC that) -- CSV permission actor duoc cap, vd 'inventory:read,inventory:write'. Thieu quyen bat buoc -> 403 FORBIDDEN.
         */
        xActorPermissions?: string,
    }): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/devices/{deviceId}/radius-secret',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'x-actor-permissions': xActorPermissions,
            },
            errors: {
                403: `FORBIDDEN -- thieu permission`,
                404: `Not found`,
            },
        });
    }
    /**
     * MikroTik tu day telemetry len server (khong qua actor guard)
     * Router tu goi vao moi 5 phut qua /system scheduler + /tool fetch, xac thuc bang header X-Device-Api-Key (KHONG PHAI x-actor-permissions/AuthStubGuard). Tai dung nguyen pipeline POST /telemetry/ingest de dedup/normalize.
     * @returns any Accepted
     * @throws ApiError
     */
    public static postDevicesTelemetryPush({
        deviceId,
        xDeviceApiKey,
        requestBody,
    }: {
        deviceId: string,
        /**
         * Key that do POST .../push-key cap -- server so sanh sha256(key) voi devices.api_key_hash.
         */
        xDeviceApiKey: string,
        requestBody: DeviceTelemetryPushRequest,
    }): CancelablePromise<{
        data?: DeviceTelemetryPushResult;
        meta?: BaseMeta;
        error?: ErrorDetails | null;
    }> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/devices/{deviceId}/telemetry-push',
            path: {
                'deviceId': deviceId,
            },
            headers: {
                'X-Device-Api-Key': xDeviceApiKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `VALIDATION_FAILED`,
                401: `DEVICE_PUSH_UNAUTHORIZED -- thieu hoac sai X-Device-Api-Key`,
                404: `Not found`,
                409: `DEVICE_PUSH_NOT_CONFIGURED -- thiet bi chua duoc cap push API key`,
            },
        });
    }
}
