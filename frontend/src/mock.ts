import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { OpenAPI } from './api/core/OpenAPI';

const FIXED_TO = '2026-08-25T10:00:00.000Z';
const FIXED_FROM = '2026-08-24T10:00:00.000Z';
const MISSING_TELEMETRY = ['INTERFACE_COUNTER', 'RADIUS_ACCOUNTING', 'IPFIX'];
const PHASE5_MISSING = ['RADIUS_ACCOUNTING', 'IPFIX_FLOW'];

function periodFrom(configUrl?: string) {
    const query = configUrl?.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    return { from: params.get('from') ?? FIXED_FROM, to: params.get('to') ?? FIXED_TO, timezone: params.get('timezone') ?? 'UTC', granularity: params.get('granularity') ?? '1h' };
}

function dashboardMeta(configUrl?: string, warningMessage = 'Telemetry collectors are not configured; traffic metrics are intentionally withheld.') {
    const period = periodFrom(configUrl);
    return {
        request_id: 'mock-request-fixed', generated_at: FIXED_TO, data_from: period.from, data_to: period.to, data_freshness_seconds: null,
        freshness_by_source: { INTERFACE_COUNTER: null, RADIUS_ACCOUNTING: null, IPFIX: null, DNS: null, SYSLOG: null },
        warnings: [{ code: 'INSUFFICIENT_DATA', message: warningMessage, details: { missing_sources: MISSING_TELEMETRY } }],
    };
}

function dashboardPeriod(configUrl?: string) {
    const period = periodFrom(configUrl);
    return { ...period, granularity: period.granularity as '1m' | '5m' | '1h' | '1d' };
}

function dashboardUnits() {
    return { traffic_bytes: 'bytes', rate: 'bits_per_second', utilization: 'percent', data_quality_score: 'ratio' } as const;
}

function unavailableAvailability(code: 'INSUFFICIENT_DATA' | 'RECONCILIATION_UNAVAILABLE') {
    return {
        status: code === 'RECONCILIATION_UNAVAILABLE' ? 'UNAVAILABLE' : 'INSUFFICIENT_DATA', code,
        message: code === 'RECONCILIATION_UNAVAILABLE' ? 'No telemetry sources are available to calculate reconciliation.' : 'Telemetry sources are not available; inventory values are shown but traffic metrics are withheld.',
        missing_sources: MISSING_TELEMETRY,
    };
}

function phaseMeta(configUrl?: string, freshness = 24, missingSources: string[] = []) {
    const period = periodFrom(configUrl);
    return {
        request_id: 'mock-phase5-fixed', generated_at: FIXED_TO, data_from: period.from, data_to: period.to,
        data_freshness_seconds: freshness,
        freshness_by_source: { RADIUS_ACCOUNTING: missingSources.includes('RADIUS_ACCOUNTING') ? null : freshness, IPFIX_FLOW: missingSources.includes('IPFIX_FLOW') ? null : freshness, HEALTH_CHECK: freshness },
        warnings: missingSources.length > 0 ? [{ code: 'INSUFFICIENT_DATA', message: 'One or more Phase 5B sources are missing.', details: { missing_sources: missingSources } }] : [],
    };
}

function phasePeriod(configUrl?: string) {
    const period = periodFrom(configUrl);
    return { ...period, granularity: period.granularity as '1m' | '5m' | '1h' | '1d' };
}

const ships = [
    { id: 'ship_healthy', code: 'MV-ALPHA', name: 'Alpha Voyager', area_id: 'area_1', status: 'ACTIVE', device_count: 12 },
    { id: 'ship_degraded', code: 'MV-BETA', name: 'Beta Explorer', area_id: 'area_1', status: 'MAINTENANCE', device_count: 9 },
    { id: 'ship_offline', code: 'MV-GAMMA', name: 'Gamma Sentinel', area_id: 'area_2', status: 'DECOMMISSIONED', device_count: 8 },
];

const areas = [
    { id: 'area_1', code: 'NA', name: 'North America', ship_count: 2, timezone: 'America/New_York', org_id: null },
    { id: 'area_2', code: 'EU', name: 'Europe', ship_count: 1, timezone: 'Europe/Amsterdam', org_id: null },
];

const interfaces = [
    { id: 'if_wan_1', device_id: 'device_alpha_edge', name: 'ether1', type: 'ETHER', mac: '00:11:22:33:44:01', parent_interface_id: null, zone_id: null, snmp_index: 1, speed_bps: 100_000_000, mtu: 1500, admin_state: 'UP', oper_state: 'UP', accounting_group: 'WAN_INPUT', counted_in_reconciliation: true, counter_source: 'SNMP', created_at: FIXED_FROM, updated_at: FIXED_TO },
    { id: 'if_crew_1', device_id: 'device_alpha_edge', name: 'ether3', type: 'ETHER', mac: '00:11:22:33:44:03', parent_interface_id: null, zone_id: 'zone_crew_alpha', snmp_index: 3, speed_bps: 1_000_000_000, mtu: 1500, admin_state: 'UP', oper_state: 'UP', accounting_group: 'CREW_ACCESS', counted_in_reconciliation: true, counter_source: 'SNMP', created_at: FIXED_FROM, updated_at: FIXED_TO },
    { id: 'if_business_1', device_id: 'device_alpha_edge', name: 'ether4', type: 'ETHER', mac: '00:11:22:33:44:04', parent_interface_id: null, zone_id: 'zone_business_alpha', snmp_index: 4, speed_bps: 1_000_000_000, mtu: 1500, admin_state: 'UP', oper_state: 'UP', accounting_group: 'BUSINESS_ACCESS', counted_in_reconciliation: true, counter_source: 'SNMP', created_at: FIXED_FROM, updated_at: FIXED_TO },
];

const healthServices = [
    { service_name: 'radius-primary', service_type: 'RADIUS', status: 'HEALTHY', healthy_endpoints: 1, total_endpoints: 2, active_endpoint: { id: 'radius-01', label: 'radius-01:1812', host: 'radius-01', port: 1812, priority: 10, status: 'HEALTHY', is_active: true, last_check_at: FIXED_TO, last_success_at: FIXED_TO, rtt_ms: 18, failure_count: 0, breaker_state: 'CLOSED', last_error: null, check: { type: 'RADIUS_ACCESS_REQUEST' } } },
    { service_name: 'control-db', service_type: 'DATABASE', status: 'DEGRADED', healthy_endpoints: 1, total_endpoints: 2, active_endpoint: { id: 'db-01', label: 'db-01:5432', host: 'db-01', port: 5432, priority: 10, status: 'HEALTHY', is_active: true, last_check_at: FIXED_TO, last_success_at: FIXED_TO, rtt_ms: 12, failure_count: 0, breaker_state: 'CLOSED', last_error: null, check: { type: 'SQL_RW' } } },
    { service_name: 'ipfix-collector', service_type: 'COLLECTOR', status: 'UNHEALTHY', healthy_endpoints: 0, total_endpoints: 1, active_endpoint: null },
    { service_name: 'backup-storage-a', service_type: 'STORAGE', status: 'HEALTHY', healthy_endpoints: 1, total_endpoints: 1, active_endpoint: { id: 'backup-a', label: 'backup-a:443', host: 'backup-a', port: 443, priority: 10, status: 'HEALTHY', is_active: true, last_check_at: FIXED_TO, last_success_at: FIXED_TO, rtt_ms: 25, failure_count: 0, breaker_state: 'CLOSED', last_error: null, check: { type: 'BACKUP_FRESHNESS' } } },
];

export function setupMockApi() {
    const mock = new MockAdapter(axios, { delayResponse: 160 });
    OpenAPI.BASE = '/api/v1';

    mock.onPost('/api/v1/auth/login').reply(200, { data: { token: 'mock-jwt-token' }, meta: { request_id: 'mock-login', generated_at: FIXED_TO, data_freshness_seconds: 0 }, error: null });
    mock.onGet('/api/v1/auth/me').reply(200, { data: { id: 'user_1', name: 'NOC Admin', role: 'admin' }, meta: { request_id: 'mock-me', generated_at: FIXED_TO, data_freshness_seconds: 0 }, error: null });

    mock.onGet(/\/api\/v1\/dashboard\/global/).reply(config => {
        const period = dashboardPeriod(config.url);
        return [200, { data: { scope: { type: 'GLOBAL' }, period, units: dashboardUnits(), data_status: 'INSUFFICIENT_DATA', availability: unavailableAvailability('INSUFFICIENT_DATA'), data_quality: { score: null, status: 'INSUFFICIENT_DATA', missing_sources: MISSING_TELEMETRY, counter_resets: null, missing_buckets: null }, total_areas: areas.length, total_ships: ships.length, total_devices: 29, online_ships: 1, degraded_ships: 1, offline_ships: 1, total_wan_throughput: null, active_crew_users: null, traffic: { wan_download_bytes: null, wan_upload_bytes: null, crew_bytes: null, business_bytes: null } }, meta: dashboardMeta(config.url), error: null }];
    });

    mock.onGet(/\/api\/v1\/areas\/[^/]+\/dashboard/).reply(config => {
        const areaId = config.url?.split('/')[4]?.split('?')[0] ?? '';
        const area = areas.find(item => item.id === areaId) ?? areas[0];
        const areaShips = ships.filter(ship => ship.area_id === area.id).map(({ id, code, name, status }) => ({ id, code, name, status, timezone: area.timezone }));
        const period = dashboardPeriod(config.url);
        return [200, { data: { scope: { type: 'AREA', id: area.id }, area: { id: area.id, code: area.code, name: area.name, timezone: area.timezone }, period, units: dashboardUnits(), data_status: 'INSUFFICIENT_DATA', availability: unavailableAvailability('INSUFFICIENT_DATA'), data_quality: { score: null, status: 'INSUFFICIENT_DATA', missing_sources: MISSING_TELEMETRY, counter_resets: null, missing_buckets: null }, inventory: { ship_count: areaShips.length, active_ships: areaShips.filter(ship => ship.status === 'ACTIVE').length }, ships: areaShips, traffic: { wan_download_bytes: null, wan_upload_bytes: null, crew_bytes: null, business_bytes: null } }, meta: dashboardMeta(config.url, 'Telemetry collectors are not configured for this area.'), error: null }];
    });

    mock.onGet(/\/api\/v1\/areas(?:\?.*)?$/).reply(200, { data: areas, meta: { request_id: 'mock-areas', generated_at: FIXED_TO, data_freshness_seconds: 4 }, error: null });
    mock.onGet(/\/api\/v1\/ships(?:\?.*)?$/).reply(200, { data: ships, meta: { request_id: 'mock-ships', generated_at: FIXED_TO, data_freshness_seconds: 4 }, error: null });

    mock.onGet(/\/api\/v1\/ships\/[^/]+\/dashboard/).reply(config => {
        const shipId = config.url?.split('/')[4]?.split('?')[0] ?? '';
        const ship = ships.find(item => item.id === shipId) ?? ships[0];
        const period = dashboardPeriod(config.url);
        return [200, { data: { scope: { type: 'SHIP', id: ship.id }, ship: { id: ship.id, code: ship.code, name: ship.name, area: { id: ship.area_id }, status: ship.status, timezone: 'UTC' }, period, units: dashboardUnits(), data_status: 'INSUFFICIENT_DATA', availability: unavailableAvailability('INSUFFICIENT_DATA'), data_quality: { score: null, status: 'INSUFFICIENT_DATA', missing_sources: MISSING_TELEMETRY, counter_resets: null, missing_buckets: null }, connectivity: { management_vpn: { status: ship.status === 'DECOMMISSIONED' ? 'DOWN' : 'UNKNOWN' }, devices: { total: ship.device_count, online: ship.status === 'ACTIVE' ? ship.device_count : 0, degraded: ship.status === 'MAINTENANCE' ? ship.device_count : 0, offline: ship.status === 'DECOMMISSIONED' ? ship.device_count : 0 } }, wan: [], crew: { active_sessions: null, total_users: null, download_bytes: null, upload_bytes: null }, business: { download_bytes: null, upload_bytes: null }, reconciliation_summary: { status: 'UNAVAILABLE', crew_gap_pct: null, wan_gap_pct: null }, alerts: { critical: 0, major: 0, warning: 0 }, status: ship.status, wan_rx: null, wan_tx: null, active_crew_users: null, crew_usage: null, business_usage: null }, meta: dashboardMeta(config.url, ship.status === 'DECOMMISSIONED' ? 'Ship is not reporting; no telemetry is available.' : 'Telemetry collectors are not configured for this ship.'), error: null }];
    });

    mock.onGet(/\/api\/v1\/ships\/[^/]+\/reconciliation(?:\/[^?]+)?/).reply(422, { data: null, meta: dashboardMeta(), error: { code: 'RECONCILIATION_UNAVAILABLE', message: 'No telemetry sources are available to calculate reconciliation.', details: { missing_sources: MISSING_TELEMETRY, period: { from: FIXED_FROM, to: FIXED_TO, timezone: 'UTC', granularity: '1h' }, formula_version: 'recon-1.0.0' }, retryable: true, retry_after_seconds: 30 } });
    mock.onGet(/\/api\/v1\/ships\/[^/]+\/interfaces/).reply(200, { data: interfaces, meta: { request_id: 'mock-interfaces', generated_at: FIXED_TO, data_freshness_seconds: 9 }, error: null });
    mock.onGet('/api/v1/health/summary').reply(200, { data: { overall: 'DEGRADED', services: healthServices }, meta: { request_id: 'mock-health', generated_at: FIXED_TO, data_freshness_seconds: 18, freshness_by_source: { health_checks: 18 } }, error: null });
    mock.onGet(/\/api\/v1\/alerts(?:\?.*)?$/).reply(200, { data: [{ id: 'alert-1', kind: 'COLLECTOR_DELAYED', status: 'FIRING', severity: 'MAJOR', scope: { ship_id: 'ship_healthy' }, title: 'IPFIX collector unavailable', summary: 'Reconciliation is withheld until IPFIX reports data.', evidence: { missing_sources: ['IPFIX'] }, started_at: FIXED_FROM, acked_by: null, acked_at: null, resolved_at: null, resolve_reason: null }], meta: { request_id: 'mock-alerts', generated_at: FIXED_TO, data_freshness_seconds: 18 }, error: null });
    mock.onGet(/\/api\/v1\/devices(?:\?.*)?$/).reply(200, { data: [{ id: 'device_alpha_edge', ship_id: 'ship_healthy', name: 'Alpha Edge', role: 'EDGE', status: 'ONLINE', management_ip: '10.0.0.1', identity: { model: 'CHR' } }], meta: { request_id: 'mock-devices', generated_at: FIXED_TO, data_freshness_seconds: 7 }, error: null });

    mock.onGet(/\/api\/v1\/ships\/([^/]+)\/crew\/users(?:\?.*)?$/).reply(config => {
        const shipId = config.url?.split('/')[4] ?? '';
        const insufficient = shipId === 'ship_offline' || shipId === 'ship_degraded';
        const period = phasePeriod(config.url);
        return [200, { data: { period, units: { traffic_bytes: 'bytes', session_time: 'seconds' }, source: 'RADIUS_ACCOUNTING', data_status: insufficient ? 'INSUFFICIENT_DATA' : 'AVAILABLE', data_quality: { score: insufficient ? null : 0.98, status: insufficient ? 'INSUFFICIENT_DATA' : 'AVAILABLE', missing_sources: insufficient ? PHASE5_MISSING : [] }, identity_capability: { status: 'AVAILABLE', method: 'RADIUS', message: 'CREW users are identified by RADIUS username.' }, service_usage_capability: { status: 'NOT_AVAILABLE', message: 'Classifier is not implemented.' }, stale_after_seconds: 300, users: insufficient ? [] : [{ username: 'alice', status: 'ACTIVE', sessions_count: 2, access_count: 2, download_bytes: 12_500_000, upload_bytes: 2_400_000, total_bytes: 14_900_000, last_seen_at: FIXED_TO, service_usage: null, domain_usage: null, identity_capability: { status: 'AVAILABLE', method: 'RADIUS', message: 'RADIUS username' } }, { username: 'bob', status: 'STALE', sessions_count: 1, access_count: 1, download_bytes: null, upload_bytes: null, total_bytes: null, last_seen_at: FIXED_FROM, service_usage: null, domain_usage: null, identity_capability: { status: 'AVAILABLE', method: 'RADIUS', message: 'RADIUS username' } }] }, meta: phaseMeta(config.url, insufficient ? 900 : 24, insufficient ? PHASE5_MISSING : []), error: null }];
    });
    mock.onGet(/\/api\/v1\/ships\/[^/]+\/crew\/users\/[^/]+\/sessions(?:\?.*)?$/).reply(config => [200, { data: { username: 'alice', units: { traffic_bytes: 'bytes', session_time: 'seconds' }, source: 'RADIUS_ACCOUNTING', identity_capability: { status: 'AVAILABLE', method: 'RADIUS', message: 'RADIUS username' }, sessions: [{ id: 'session-1', acct_session_id: 'acct-1', status: 'ACTIVE', framed_ip: '10.100.0.10', calling_station_mac: 'AA:BB:CC:DD:EE:01', start_time: FIXED_FROM, stop_time: null, last_interim_at: FIXED_TO, upload_bytes: 2_400_000, download_bytes: 12_500_000, total_bytes: 14_900_000, session_time_s: 86_400, terminate_cause: null }] }, meta: phaseMeta(config.url), error: null }]);
    mock.onGet(/\/api\/v1\/ships\/[^/]+\/crew\/radius-health(?:\?.*)?$/).reply(config => [200, { data: { source: 'RADIUS_ACCOUNTING', units: { freshness: 'seconds' }, status: 'DEGRADED', min_required_endpoints: 2, configured_endpoints: 2, healthy_endpoints: 1, ha_compliant: false, endpoints: [{ service_name: 'radius-primary', status: 'HEALTHY', is_active: true }, { service_name: 'radius-secondary', status: 'UNHEALTHY', is_active: false }], accounting_freshness_seconds: 42, data_quality: { score: 0.8, status: 'PARTIAL', missing_sources: [] } }, meta: phaseMeta(config.url, 42), error: null }]);
    mock.onGet(/\/api\/v1\/ships\/[^/]+\/crew\/raw-accounting(?:\?.*)?$/).reply(config => [200, { data: { period: phasePeriod(config.url), units: { traffic_bytes: 'bytes' }, source: 'RADIUS_ACCOUNTING', records: [{ username: 'alice', acct_session_id: 'acct-1', observed_at: FIXED_TO, acct_status_type: 'Interim-Update', input_octets: 2_400_000, output_octets: 12_500_000 }] }, meta: phaseMeta(config.url), error: null }]);

    mock.onGet(/\/api\/v1\/ships\/[^/]+\/business\/devices(?:\?.*)?$/).reply(config => [200, { data: { period: phasePeriod(config.url), units: { traffic_bytes: 'bytes' }, source: 'IPFIX_FLOW', data_status: 'AVAILABLE', data_quality: { score: 0.91, status: 'PARTIAL', missing_sources: [] }, identity_capability: { status: 'NOT_AVAILABLE', method: 'NONE', message: 'BUSINESS is identified by IP/MAC/VLAN; username attribution is not available.' }, top_device: { ip: '10.200.0.15', mac: 'AA:BB:CC:DD:EE:15', vlan_id: 200, download_bytes: null, upload_bytes: null, total_bytes: 55_000_000, flow_count: 22, first_seen_at: FIXED_FROM, last_seen_at: FIXED_TO, identity_capability: { status: 'NOT_AVAILABLE', method: 'NONE', message: 'Port/IP/MAC/VLAN identity' } }, devices: [{ ip: '10.200.0.15', mac: 'AA:BB:CC:DD:EE:15', vlan_id: 200, download_bytes: null, upload_bytes: null, total_bytes: 55_000_000, flow_count: 22, first_seen_at: FIXED_FROM, last_seen_at: FIXED_TO, identity_capability: { status: 'NOT_AVAILABLE', method: 'NONE', message: 'Port/IP/MAC/VLAN identity' } }] }, meta: phaseMeta(config.url), error: null }]);
    mock.onGet(/\/api\/v1\/ships\/[^/]+\/business\/usage(?:\?.*)?$/).reply(config => [200, { data: { period: phasePeriod(config.url), units: { traffic_bytes: 'bytes' }, source: 'INTERFACE_COUNTER', data_status: 'AVAILABLE', data_quality: { score: 0.94, status: 'PARTIAL', missing_sources: [] }, points: [{ bucket: FIXED_FROM, download_bytes: 30_000_000, upload_bytes: 4_000_000, total_bytes: 34_000_000, counter_resets: 0 }] }, meta: phaseMeta(config.url), error: null }]);
    mock.onGet(/\/api\/v1\/ships\/[^/]+\/business\/flows\/unknown(?:\?.*)?$/).reply(config => [200, { data: { period: phasePeriod(config.url), units: { traffic_bytes: 'bytes' }, source: 'IPFIX_FLOW', records: [{ src_ip: '10.200.0.15', dst_ip: '203.0.113.10', bytes: 12_000_000, flow_count: 4, unknown_reason: 'CLASSIFIER_NOT_IMPLEMENTED' }], identity_capability: { status: 'NOT_AVAILABLE', method: 'NONE', message: 'BUSINESS is identified by IP/MAC/VLAN; username attribution is not available.' } }, meta: phaseMeta(config.url), error: null }]);
    mock.onGet(/\/api\/v1\/ships\/[^/]+\/business\/flows(?:\?.*)?$/).reply(config => [200, { data: { period: phasePeriod(config.url), units: { traffic_bytes: 'bytes' }, source: 'IPFIX_FLOW', data_status: 'AVAILABLE', data_quality: { score: 0.88, status: 'PARTIAL', missing_sources: [] }, total_bytes: 55_000_000, flow_count: 22, classification_method: 'UNKNOWN', unknown_reason: 'CLASSIFIER_NOT_IMPLEMENTED', unattributed_bytes: 55_000_000, top_destinations: [{ dst_ip: '203.0.113.10', bytes: 12_000_000, flow_count: 4 }, { dst_ip: '198.51.100.20', bytes: 8_000_000, flow_count: 3 }], identity_capability: { status: 'NOT_AVAILABLE', method: 'NONE', message: 'BUSINESS is identified by IP/MAC/VLAN; username attribution is not available.' } }, meta: phaseMeta(config.url), error: null }]);
    mock.onGet(/\/api\/v1\/ships\/[^/]+\/business\/raw-records(?:\?.*)?$/).reply(config => [200, { data: { period: phasePeriod(config.url), units: { traffic_bytes: 'bytes' }, source: 'IPFIX_FLOW', records: [{ src_ip: '10.200.0.15', dst_ip: '203.0.113.10', bytes: 12_000_000, observed_at: FIXED_TO }], identity_capability: { status: 'NOT_AVAILABLE', method: 'NONE', message: 'BUSINESS identity' } }, meta: phaseMeta(config.url), error: null }]);

    mock.onGet('/api/v1/health/ha').reply(200, { data: { radius: { min_required: 2, configured_endpoints: 2, compliant: false, groups: [{ service_name: 'radius-primary', configured_endpoints: 2, healthy_endpoints: 1, primary_endpoint_id: 'radius-01', active_endpoint_id: 'radius-01', failover_state: 'FAILED_OVER', endpoints: [] }] }, database: { min_required: 2, configured_endpoints: 2, compliant: true, groups: [{ service_name: 'control-db', configured_endpoints: 2, healthy_endpoints: 2, primary_endpoint_id: 'db-01', active_endpoint_id: 'db-01', failover_state: 'NORMAL', endpoints: [] }] }, collector: { configured_endpoints: 1, groups: [] }, raw_storage: { configured_endpoints: 1, groups: [] }, backup_storage: { min_required_targets: 2, configured_targets: 1, compliant: false, groups: [{ service_name: 'backup-storage-a', status: 'HEALTHY' }] } }, meta: { request_id: 'mock-ha', generated_at: FIXED_TO, data_freshness_seconds: 35, freshness_by_source: { service_registry: 35 }, warnings: [{ code: 'HA_WARNING', message: 'RADIUS failover is active and backup target B is missing.', details: { missing_sources: ['backup-storage-b'] } }] }, error: null });
    mock.onGet('/api/v1/telemetry/health').reply(200, { data: { status: 'DEGRADED', raw_store: { status: 'HEALTHY', latest_received_at: FIXED_FROM }, sources: [{ source: 'INTERFACE_COUNTER', status: 'HEALTHY', event_count: 120, last_received_at: FIXED_TO, freshness_seconds: 22 }, { source: 'RADIUS_ACCOUNTING', status: 'UNKNOWN', event_count: 0, last_received_at: null, freshness_seconds: null }, { source: 'IPFIX_FLOW', status: 'DEGRADED', event_count: 18, last_received_at: FIXED_FROM, freshness_seconds: 86_400 }] }, meta: { request_id: 'mock-telemetry-health', generated_at: FIXED_TO, data_freshness_seconds: 86_400, freshness_by_source: { raw_store: 86_400, INTERFACE_COUNTER: 22, RADIUS_ACCOUNTING: null, IPFIX_FLOW: 86_400 }, warnings: [{ code: 'TELEMETRY_STALE', message: 'IPFIX_FLOW has not reported recently.', details: { missing_sources: ['RADIUS_ACCOUNTING'] } }] }, error: null });
    mock.onAny().passThrough();
}
