import { expect, test } from 'vitest';
import { BusinessService, CrewService, HealthService, TelemetryService } from './api';
import { formatBytes } from './lib/dashboard';
import { setupMockApi } from './mock';

setupMockApi();

const query = { from: '2026-08-24T10:00:00.000Z', to: '2026-08-25T10:00:00.000Z', timezone: 'UTC', granularity: '1h' as const };

test('CREW API returns users when accounting is available and insufficient state when it is not', async () => {
    const available = await CrewService.getShipsCrewUsers({ shipId: 'ship_healthy', ...query });
    const insufficient = await CrewService.getShipsCrewUsers({ shipId: 'ship_offline', ...query });

    expect(available.data?.data_status).toBe('AVAILABLE');
    expect(available.data?.users?.[0]?.username).toBe('alice');
    expect(insufficient.data?.data_status).toBe('INSUFFICIENT_DATA');
    expect(insufficient.data?.users).toEqual([]);
});

test('BUSINESS unknown flow endpoint exposes classifier state without a username', async () => {
    const response = await BusinessService.getShipsBusinessFlowsUnknown({ shipId: 'ship_healthy', ...query });

    expect(response.data?.records?.length).toBe(1);
    expect(response.data?.identity_capability?.status).toBe('NOT_AVAILABLE');
    expect(JSON.stringify(response.data?.records)).toContain('CLASSIFIER_NOT_IMPLEMENTED');
});

test('telemetry health preserves stale freshness', async () => {
    const response = await TelemetryService.getTelemetryHealth({});

    expect(response.meta?.data_freshness_seconds).toBe(86_400);
    expect(response.data?.sources?.find(source => source.source === 'IPFIX_FLOW')?.freshness_seconds).toBe(86_400);
});

test('HA warning exposes failed-over RADIUS and missing backup compliance', async () => {
    const response = await HealthService.getHealthHa({});

    expect(response.data?.radius?.compliant).toBe(false);
    expect(response.data?.radius?.groups?.[0]?.failover_state).toBe('FAILED_OVER');
    expect(response.data?.backup_storage?.compliant).toBe(false);
});

test('null bytes stay unavailable instead of becoming zero', () => {
    expect(formatBytes(null)).toEqual({ value: 'Not available', unit: '' });
});
