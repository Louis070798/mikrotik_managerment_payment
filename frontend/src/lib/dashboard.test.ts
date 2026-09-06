import { expect, test } from 'vitest';
import { DashboardAvailability } from '../api/models/DashboardAvailability';
import {
    formatBytes,
    formatCount,
    formatRate,
    metricStatus,
    missingSourcesFrom,
} from './dashboard';

test('keeps unavailable numeric values explicit instead of converting them to zero', () => {
    expect(formatBytes(null)).toEqual({ value: 'Not available', unit: '' });
    expect(formatCount(undefined)).toBe('Not available');
    expect(formatRate(1_500_000)).toEqual({ value: '1.50', unit: 'Mbit/s' });
});

test('derives missing sources and status from API availability metadata', () => {
    const sources = missingSourcesFrom(
        {
            status: DashboardAvailability.status.INSUFFICIENT_DATA,
            code: DashboardAvailability.code.INSUFFICIENT_DATA,
            missing_sources: ['interface_counters'],
        },
        {
            warnings: [
                {
                    code: 'MISSING_SOURCE',
                    message: 'RADIUS is not available',
                    details: { missing_sources: ['radius_accounting'] },
                },
            ],
        } as never,
        { status: 'PARTIAL', missing_sources: ['ipfix'] } as never,
    );

    expect(sources).toEqual(['interface_counters', 'ipfix', 'radius_accounting']);
    expect(metricStatus('INSUFFICIENT_DATA', {
        status: DashboardAvailability.status.INSUFFICIENT_DATA,
        code: DashboardAvailability.code.INSUFFICIENT_DATA,
        missing_sources: [],
    })).toBe('unknown');
    expect(metricStatus('AVAILABLE', {
        status: DashboardAvailability.status.AVAILABLE,
        code: null,
        missing_sources: [],
    }, { status: 'PARTIAL', missing_sources: [] } as never)).toBe('warning');
});
