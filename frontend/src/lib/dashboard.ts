import { ApiError as CoreApiError } from '../api/core/ApiError';
import type { BaseMeta } from '../api/models/BaseMeta';
import type { DashboardAvailability } from '../api/models/DashboardAvailability';
import type { DashboardPeriod } from '../api/models/DashboardPeriod';
import type { DataQuality } from '../api/models/DataQuality';
import type { ModuleDataQuality } from '../api/models/ModuleDataQuality';

export type DashboardRange = '1h' | '24h' | '7d';
export type DashboardZone = 'ALL' | 'CREW' | 'BUSINESS' | 'MANAGEMENT';
export type DashboardGranularity = '1m' | '5m' | '1h' | '1d';
export type MetricStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

// Khớp GRANULARITY_SECONDS ở backend/src/libs/telemetry-normalize/aggregation.ts — độ dài 1 bucket
// theo giây, dùng để quy đổi bytes/bucket (volume) sang bit/s (tốc độ) cho biểu đồ.
export const GRANULARITY_SECONDS: Record<DashboardGranularity, number> = { '1m': 60, '5m': 300, '1h': 3600, '1d': 86400 };

export function bytesToRateBps(bytes: number | null | undefined, granularity: DashboardGranularity): number | null {
    if (bytes === null || bytes === undefined) return null;
    return (bytes * 8) / GRANULARITY_SECONDS[granularity];
}

export type DashboardFiltersValue = {
    range: DashboardRange;
    timezone: string;
    granularity: DashboardGranularity;
    zone: DashboardZone;
};

export type DashboardQuery = {
    from: string;
    to: string;
    timezone: string;
    granularity: DashboardGranularity;
    zone: DashboardZone;
};

export function buildDashboardQuery(filters: DashboardFiltersValue): DashboardQuery {
    const to = new Date();
    const durationMs: Record<DashboardRange, number> = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
    };
    const from = new Date(to.getTime() - durationMs[filters.range]);
    return {
        from: from.toISOString(),
        to: to.toISOString(),
        timezone: filters.timezone,
        granularity: filters.granularity,
        zone: filters.zone,
    };
}

export function formatBytes(value: number | null | undefined): { value: string; unit: string } {
    if (value === null || value === undefined) return { value: 'Not available', unit: '' };
    if (value < 1000) return { value: value.toLocaleString(), unit: 'bytes' };
    const units = ['kB', 'MB', 'GB', 'TB', 'PB'];
    let amount = value;
    let index = -1;
    while (amount >= 1000 && index < units.length - 1) {
        amount /= 1000;
        index += 1;
    }
    return { value: amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2), unit: units[index] };
}

export function formatRate(value: number | null | undefined): { value: string; unit: string } {
    if (value === null || value === undefined) return { value: 'Not available', unit: '' };
    if (value < 1000) return { value: value.toLocaleString(), unit: 'bit/s' };
    const units = ['kbit/s', 'Mbit/s', 'Gbit/s', 'Tbit/s'];
    let amount = value;
    let index = -1;
    while (amount >= 1000 && index < units.length - 1) {
        amount /= 1000;
        index += 1;
    }
    return { value: amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2), unit: units[index] };
}

export function formatVnd(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'Not available';
    return `${value.toLocaleString('vi-VN')} ₫`;
}

export function formatCount(value: number | null | undefined): string {
    return value === null || value === undefined ? 'Not available' : value.toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
    return value === null || value === undefined ? 'Not available' : `${value.toFixed(1)}%`;
}

export function formatPeriod(period?: DashboardPeriod): string {
    if (!period) return 'Period not returned by API';
    const from = new Date(period.from).toLocaleString();
    const to = new Date(period.to).toLocaleString();
    return `${from} – ${to} (${period.timezone}, ${period.granularity})`;
}

export function freshnessLabel(meta?: BaseMeta): string {
    if (meta?.data_freshness_seconds !== undefined && meta.data_freshness_seconds !== null) {
        return `${meta.data_freshness_seconds}s old`;
    }
    return 'Not reported';
}

export function metricStatus(
    dataStatus?: string,
    availability?: DashboardAvailability,
    quality?: DataQuality | ModuleDataQuality,
): MetricStatus {
    if (dataStatus === 'UNAVAILABLE' || availability?.status === 'UNAVAILABLE') return 'critical';
    if (dataStatus === 'INSUFFICIENT_DATA' || availability?.status === 'INSUFFICIENT_DATA') return 'unknown';
    if (quality?.status === 'PARTIAL') return 'warning';
    return 'healthy';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export type ApiErrorInfo = {
    status?: number;
    code?: string;
    message: string;
    details?: Record<string, unknown>;
};

export function getApiErrorInfo(error: unknown): ApiErrorInfo {
    if (error instanceof CoreApiError) {
        const body = isRecord(error.body) ? error.body : undefined;
        const apiError = body && isRecord(body.error) ? body.error : body;
        return {
            status: error.status,
            code: apiError && typeof apiError.code === 'string' ? apiError.code : undefined,
            message: apiError && typeof apiError.message === 'string' ? apiError.message : error.message,
            details: apiError && isRecord(apiError.details) ? apiError.details : undefined,
        };
    }
    if (error instanceof Error) return { message: error.message };
    return { message: 'The API request failed.' };
}

export function missingSourcesFrom(
    availability?: DashboardAvailability,
    meta?: BaseMeta,
    quality?: DataQuality | ModuleDataQuality,
): string[] {
    const sources = new Set<string>();
    availability?.missing_sources.forEach(source => sources.add(source));
    quality?.missing_sources.forEach(source => sources.add(source));
    meta?.warnings?.forEach(warning => {
        const details = warning.details;
        if (details && Array.isArray(details.missing_sources)) {
            details.missing_sources.forEach(source => {
                if (typeof source === 'string') sources.add(source);
            });
        }
    });
    return [...sources];
}
