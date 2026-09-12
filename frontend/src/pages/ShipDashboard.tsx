import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Anchor, Database, Server, ShieldAlert } from 'lucide-react';
import { AlertsService, BusinessService, CrewService, DashboardAvailability, DashboardService, DefaultService, HealthService, InterfacesService, InventoryService, ReconciliationService, TelemetryService } from '../api';
import type { Alert } from '../api/models/Alert';
import type { BusinessDevicesResponse } from '../api/models/BusinessDevicesResponse';
import type { BusinessFlowsResponse } from '../api/models/BusinessFlowsResponse';
import type { BusinessRawRecordsResponse } from '../api/models/BusinessRawRecordsResponse';
import type { BusinessUsageResponse } from '../api/models/BusinessUsageResponse';
import type { CrewRadiusHealthResponse } from '../api/models/CrewRadiusHealthResponse';
import type { CrewRawAccountingResponse } from '../api/models/CrewRawAccountingResponse';
import type { CrewSessionsResponse } from '../api/models/CrewSessionsResponse';
import type { CrewUsersResponse } from '../api/models/CrewUsersResponse';
import type { Device } from '../api/models/Device';
import type { HealthHaResponse } from '../api/models/HealthHaResponse';
import type { HealthSummary } from '../api/models/HealthSummary';
import type { Interface as ShipInterface } from '../api/models/Interface';
import type { ReconciliationByWanResponse } from '../api/models/ReconciliationByWanResponse';
import type { ReconciliationResponse } from '../api/models/ReconciliationResponse';
import type { ShipDashboardResponse } from '../api/models/ShipDashboardResponse';
import { ShipCreateRequest } from '../api/models/ShipCreateRequest';
import type { ShipItem } from '../api/models/ShipItem';
import type { TelemetryHealthResponse } from '../api/models/TelemetryHealthResponse';
import { AwaitingContract, DataStateNotice } from '../components/DataStateNotice';
import { DashboardFilters } from '../components/DashboardFilters';
import { MetricCard } from '../components/MetricCard';
import { CategoryVolumeBarChart } from '../components/CategoryVolumeBarChart';
import { VolumeSpeedChart } from '../components/VolumeSpeedChart';
import { buildDashboardQuery, formatBytes, formatCount, formatPeriod, formatPercent, formatRate, freshnessLabel, getApiErrorInfo, isRecord, type DashboardFiltersValue, type DashboardGranularity, type MetricStatus } from '../lib/dashboard';
import { DEFAULT_ROUTEROS_CONFIG_TEMPLATE } from '../lib/routerosConfigTemplate';

type Tab = 'Overview' | 'WAN & Reconciliation' | 'Interfaces' | 'CREW' | 'BUSINESS' | 'Traffic Flow' | 'Devices' | 'Health & Events' | 'Configuration' | 'Backup';
type ReconciliationMode = 'summary' | 'by-wan' | 'by-interface' | 'by-zone' | 'timeseries' | 'raw';

const tabs: Tab[] = ['Overview', 'WAN & Reconciliation', 'Interfaces', 'CREW', 'BUSINESS', 'Traffic Flow', 'Devices', 'Health & Events', 'Configuration', 'Backup'];
const initialFilters: DashboardFiltersValue = { range: '24h', timezone: 'UTC', granularity: '1h', zone: 'ALL' };
const DEFAULT_AREA_CODE = 'DEFAULT';
const emptyCreateShipForm = { code: '', name: '', status: ShipCreateRequest.status.ACTIVE, timezone: 'UTC', imo: '', mmsi: '', crew_capacity: '' };
type RequestKey = 'ship' | 'reconciliation' | 'interfaces' | 'health' | 'devices' | 'crew' | 'crewSessions' | 'business';
const requestKeys: RequestKey[] = ['ship', 'reconciliation', 'interfaces', 'health', 'devices', 'crew', 'crewSessions', 'business'];
type RequestRegistry = { current: Record<RequestKey, number> };

function beginRequest(registry: RequestRegistry, key: RequestKey): number {
    registry.current[key] += 1;
    return registry.current[key];
}

function isCurrentRequest(registry: RequestRegistry, key: RequestKey, requestId: number): boolean {
    return registry.current[key] === requestId;
}

function statusClass(status?: string): MetricStatus {
    if (status === 'HEALTHY' || status === 'ACTIVE' || status === 'ONLINE' || status === 'UP') return 'healthy';
    if (status === 'DEGRADED' || status === 'MAINTENANCE') return 'warning';
    if (status === 'UNHEALTHY' || status === 'OFFLINE' || status === 'DOWN' || status === 'DECOMMISSIONED') return 'critical';
    return 'unknown';
}

function errorMissingSources(error: unknown): string[] {
    const info = getApiErrorInfo(error);
    const sources = info.details?.missing_sources;
    return Array.isArray(sources) ? sources.filter((source): source is string => typeof source === 'string') : [];
}

// service_usage/domain_usage (CrewUser) and by_app/by_domain (BusinessFlowsResponse) are untyped
// arrays of {label, bytes[, flow_count]} from the real DNS classifier — null means the classifier
// found nothing usable ("Không rõ"), an empty array means it ran but found no classified traffic
// this period ("Chưa có dữ liệu") — these are NOT the same thing.
function usageChips(list: unknown, labelKey: 'app' | 'domain', limit = 4): React.ReactNode {
    if (!Array.isArray(list)) return <span className="muted-text">Không rõ</span>;
    if (list.length === 0) return <span className="muted-text">Chưa có dữ liệu</span>;
    const shown = list.slice(0, limit);
    const remaining = list.length - limit;
    return (
        <div className="chip-list">
            {shown.map((item, idx) => {
                if (!isRecord(item)) return null;
                const label = typeof item[labelKey] === 'string' ? item[labelKey] : 'Không rõ';
                const formatted = formatBytes(typeof item.bytes === 'number' ? item.bytes : null);
                return <span className="usage-chip" key={`${label}-${idx}`}>{label} <strong>{formatted.value}{formatted.unit ? ` ${formatted.unit}` : ''}</strong></span>;
            })}
            {remaining > 0 && <span className="usage-chip muted-text">+{remaining} khác</span>}
        </div>
    );
}

// subscription_status (ACTIVE/SUSPENDED/EXPIRED, tai khoan subscriber that) khac voi status
// (ACTIVE/INACTIVE, chi la co phien RADIUS dang mo trong ky dang xem hay khong).
function subscriptionStatusClass(status?: string | null): MetricStatus {
    if (status === 'ACTIVE') return 'healthy';
    if (status === 'SUSPENDED') return 'warning';
    if (status === 'EXPIRED') return 'critical';
    return 'unknown';
}

function quotaPct(usedBytes?: number | null, quotaGb?: number | null): number | null {
    if (usedBytes === null || usedBytes === undefined || !quotaGb) return null;
    return Math.round((usedBytes / (quotaGb * 1_000_000_000)) * 1000) / 10;
}

function quotaStatus(pct: number | null): MetricStatus {
    if (pct === null) return 'unknown';
    if (pct >= 100) return 'critical';
    if (pct >= 80) return 'warning';
    return 'healthy';
}

export const ShipDashboard: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [filters, setFilters] = useState(initialFilters);
    const [ships, setShips] = useState<ShipItem[]>([]);
    const [selectedShipId, setSelectedShipId] = useState(searchParams.get('ship') ?? '');
    const [activeTab, setActiveTab] = useState<Tab>('Overview');
    const [shipResponse, setShipResponse] = useState<ShipDashboardResponse>();
    const [shipLoading, setShipLoading] = useState(true);
    const [shipError, setShipError] = useState('');
    const [reconciliationMode, setReconciliationMode] = useState<ReconciliationMode>('summary');
    const [reconciliation, setReconciliation] = useState<ReconciliationResponse | ReconciliationByWanResponse>();
    const [reconciliationError, setReconciliationError] = useState<ReturnType<typeof getApiErrorInfo>>();
    const [reconciliationLoading, setReconciliationLoading] = useState(false);
    const [interfaces, setInterfaces] = useState<ShipInterface[]>([]);
    const [interfacesLoading, setInterfacesLoading] = useState(false);
    const [interfacesError, setInterfacesError] = useState('');
    const [health, setHealth] = useState<HealthSummary>();
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthError, setHealthError] = useState('');
    const [devices, setDevices] = useState<Device[]>([]);
    const [devicesLoading, setDevicesLoading] = useState(false);
    const [devicesError, setDevicesError] = useState('');
    const [crewUsers, setCrewUsers] = useState<CrewUsersResponse>();
    const [crewRadiusHealth, setCrewRadiusHealth] = useState<CrewRadiusHealthResponse>();
    const [crewRawAccounting, setCrewRawAccounting] = useState<CrewRawAccountingResponse>();
    const [crewSessions, setCrewSessions] = useState<CrewSessionsResponse>();
    const [crewSelectedUsername, setCrewSelectedUsername] = useState('');
    const [crewLoading, setCrewLoading] = useState(false);
    const [crewError, setCrewError] = useState('');
    const [businessDevices, setBusinessDevices] = useState<BusinessDevicesResponse>();
    const [businessUsage, setBusinessUsage] = useState<BusinessUsageResponse>();
    const [businessFlows, setBusinessFlows] = useState<BusinessFlowsResponse>();
    const [businessUnknownFlows, setBusinessUnknownFlows] = useState<BusinessRawRecordsResponse>();
    const [businessRawRecords, setBusinessRawRecords] = useState<BusinessRawRecordsResponse>();
    const [businessLoading, setBusinessLoading] = useState(false);
    const [businessError, setBusinessError] = useState('');
    const [healthHa, setHealthHa] = useState<HealthHaResponse>();
    const [telemetryHealth, setTelemetryHealth] = useState<TelemetryHealthResponse>();
    const [shipsLoading, setShipsLoading] = useState(true);
    const [showCreateShip, setShowCreateShip] = useState(false);
    const [createShipForm, setCreateShipForm] = useState(emptyCreateShipForm);
    const [createShipError, setCreateShipError] = useState('');
    const [savingShip, setSavingShip] = useState(false);
    // Sau khi tạo tàu thành công, modal chuyển sang bước "xuất cấu hình router mẫu" thay vì đóng
    // ngay — tàu mới luôn cần dán config này vào router trước khi chạy script push.
    const [createdShipName, setCreatedShipName] = useState<string>();
    const [configCopyFeedback, setConfigCopyFeedback] = useState(false);
    const requestIds = useRef<Record<RequestKey, number>>({ ship: 0, reconciliation: 0, interfaces: 0, health: 0, devices: 0, crew: 0, crewSessions: 0, business: 0 });
    const query = useMemo(() => buildDashboardQuery(filters), [filters]);

    useEffect(() => () => {
        requestKeys.forEach(key => { requestIds.current[key] += 1; });
    }, []);

    const fetchShips = useCallback(() => {
        setShipsLoading(true);
        return DefaultService.getShips({}).then(next => {
            const items = next.data ?? [];
            setShips(items);
            const firstShipId = items[0]?.id ?? '';
            setSelectedShipId(current => current || searchParams.get('ship') || firstShipId);
        }).catch(requestError => { setShipError(getApiErrorInfo(requestError).message); })
            .finally(() => setShipsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { void fetchShips(); }, [fetchShips]);

    // Không lộ khái niệm "khu vực" ra UI (theo yêu cầu) — tự đảm bảo có đúng 1 khu vực mặc định
    // để gán area_id bắt buộc (NOT NULL FK) khi tạo tàu, thay vì bắt người dùng chọn khu vực.
    const ensureDefaultAreaId = useCallback(async (): Promise<string> => {
        const existing = await DefaultService.getAreas({});
        const found = (existing.data ?? [])[0]?.id;
        if (found) return found;
        const created = await InventoryService.postAreas({
            requestBody: { code: DEFAULT_AREA_CODE, name: 'Khu vực mặc định', timezone: 'UTC' },
        });
        if (!created.data?.id) throw new Error('Không tạo được khu vực mặc định');
        return created.data.id;
    }, []);

    const createShip = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingShip(true);
        setCreateShipError('');
        try {
            const areaId = await ensureDefaultAreaId();
            await InventoryService.postShips({
                requestBody: {
                    area_id: areaId,
                    code: createShipForm.code,
                    name: createShipForm.name,
                    status: createShipForm.status,
                    timezone: createShipForm.timezone,
                    imo: createShipForm.imo || null,
                    mmsi: createShipForm.mmsi || null,
                    crew_capacity: createShipForm.crew_capacity ? Number(createShipForm.crew_capacity) : null,
                },
            });
            // Không đóng modal ngay — chuyển sang bước xuất cấu hình router mẫu.
            setCreatedShipName(createShipForm.name);
            await fetchShips();
        } catch (requestError) {
            setCreateShipError(getApiErrorInfo(requestError).message);
        } finally {
            setSavingShip(false);
        }
    };

    const closeCreateShipModal = () => {
        setShowCreateShip(false);
        setCreatedShipName(undefined);
        setConfigCopyFeedback(false);
        setCreateShipForm(emptyCreateShipForm);
    };

    const copyConfigTemplate = async () => {
        try {
            await navigator.clipboard.writeText(DEFAULT_ROUTEROS_CONFIG_TEMPLATE);
            setConfigCopyFeedback(true);
            setTimeout(() => setConfigCopyFeedback(false), 2000);
        } catch {
            setConfigCopyFeedback(false);
        }
    };

    const selectShip = (shipId: string) => {
        setSelectedShipId(shipId);
        setSearchParams({ ship: shipId }, { replace: true });
    };

    const fetchShip = useCallback(async () => {
        if (!selectedShipId) return;
        const currentRequestId = beginRequest(requestIds, 'ship');
        setShipLoading(true);
        setShipError('');
        try {
            const nextResponse = await DashboardService.getShipsDashboard({ shipId: selectedShipId, ...query });
            if (isCurrentRequest(requestIds, 'ship', currentRequestId)) setShipResponse(nextResponse);
        } catch (requestError) {
            if (isCurrentRequest(requestIds, 'ship', currentRequestId)) setShipError(getApiErrorInfo(requestError).message);
        } finally {
            if (isCurrentRequest(requestIds, 'ship', currentRequestId)) setShipLoading(false);
        }
    }, [query, selectedShipId]);

    // This effect synchronizes the dashboard with the external API; its async callback owns loading/error state.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchShip(); }, [fetchShip]);

    const fetchReconciliation = useCallback(async () => {
        if (!selectedShipId) return;
        const currentRequestId = beginRequest(requestIds, 'reconciliation');
        setReconciliationLoading(true);
        setReconciliationError(undefined);
        try {
            const args = { shipId: selectedShipId, ...query };
            const result = reconciliationMode === 'summary'
                ? await ReconciliationService.getShipsReconciliation(args)
                : reconciliationMode === 'by-wan'
                    ? await ReconciliationService.getShipsReconciliationByWan(args)
                    : reconciliationMode === 'by-interface'
                        ? await ReconciliationService.getShipsReconciliationByInterface(args)
                        : reconciliationMode === 'by-zone'
                            ? await ReconciliationService.getShipsReconciliationByZone(args)
                            : reconciliationMode === 'timeseries'
                                ? await ReconciliationService.getShipsReconciliationTimeseries(args)
                                : await ReconciliationService.getShipsReconciliationRawRecords({ ...args, limit: 100 });
            if (isCurrentRequest(requestIds, 'reconciliation', currentRequestId)) setReconciliation(result);
        } catch (requestError) {
            if (isCurrentRequest(requestIds, 'reconciliation', currentRequestId)) {
                setReconciliation(undefined);
                setReconciliationError(getApiErrorInfo(requestError));
            }
        } finally {
            if (isCurrentRequest(requestIds, 'reconciliation', currentRequestId)) setReconciliationLoading(false);
        }
    }, [query, reconciliationMode, selectedShipId]);

    // This effect synchronizes the active tab with the external API.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { if (activeTab === 'WAN & Reconciliation') void fetchReconciliation(); }, [activeTab, fetchReconciliation]);

    useEffect(() => {
        if (activeTab !== 'Interfaces' || !selectedShipId) return;
        const requestRegistry = requestIds.current;
        const currentRequestId = beginRequest(requestIds, 'interfaces');
        // This effect synchronizes the active tab with the external API; loading/error are request state.
        // oxlint-disable-next-line react/set-state-in-effect
        setInterfacesLoading(true);
        setInterfacesError('');
        void InterfacesService.getShipsInterfaces({ shipId: selectedShipId }).then(result => {
            if (isCurrentRequest(requestIds, 'interfaces', currentRequestId)) setInterfaces(result.data ?? []);
        }).catch(requestError => {
            if (isCurrentRequest(requestIds, 'interfaces', currentRequestId)) setInterfacesError(getApiErrorInfo(requestError).message);
        }).finally(() => {
            if (isCurrentRequest(requestIds, 'interfaces', currentRequestId)) setInterfacesLoading(false);
        });
        return () => { requestRegistry.interfaces += 1; };
    }, [activeTab, selectedShipId]);

    const fetchHealth = useCallback(async () => {
        const currentRequestId = beginRequest(requestIds, 'health');
        setHealthLoading(true);
        setHealthError('');
        try {
            const [healthResponse, alertResponse, haResponse, telemetryResponse] = await Promise.all([
                HealthService.getHealthSummary({}),
                AlertsService.getAlerts({ status: 'FIRING', limit: 50 }),
                HealthService.getHealthHa({}),
                TelemetryService.getTelemetryHealth({}),
            ]);
            if (isCurrentRequest(requestIds, 'health', currentRequestId)) {
                setHealth(healthResponse.data);
                setAlerts(alertResponse.data ?? []);
                setHealthHa(haResponse);
                setTelemetryHealth(telemetryResponse);
            }
        } catch (requestError) {
            if (isCurrentRequest(requestIds, 'health', currentRequestId)) setHealthError(getApiErrorInfo(requestError).message);
        } finally {
            if (isCurrentRequest(requestIds, 'health', currentRequestId)) setHealthLoading(false);
        }
    }, []);

    // This effect synchronizes the active tab with the external API.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { if (activeTab === 'Health & Events') void fetchHealth(); }, [activeTab, fetchHealth]);

    useEffect(() => {
        if (activeTab !== 'Devices' || !selectedShipId) return;
        const requestRegistry = requestIds.current;
        const currentRequestId = beginRequest(requestIds, 'devices');
        // This effect synchronizes the active tab with the external API; loading/error are request state.
        // oxlint-disable-next-line react/set-state-in-effect
        setDevicesLoading(true);
        setDevicesError('');
        void InventoryService.getDevices({ shipId: selectedShipId }).then(result => {
            if (isCurrentRequest(requestIds, 'devices', currentRequestId)) setDevices(result.data ?? []);
        }).catch(requestError => {
            if (isCurrentRequest(requestIds, 'devices', currentRequestId)) setDevicesError(getApiErrorInfo(requestError).message);
        }).finally(() => {
            if (isCurrentRequest(requestIds, 'devices', currentRequestId)) setDevicesLoading(false);
        });
        return () => { requestRegistry.devices += 1; };
    }, [activeTab, selectedShipId]);

    const fetchCrew = useCallback(async () => {
        if (!selectedShipId) return;
        const currentRequestId = beginRequest(requestIds, 'crew');
        setCrewLoading(true);
        setCrewError('');
        try {
            const [users, radius, raw] = await Promise.all([
                CrewService.getShipsCrewUsers({ shipId: selectedShipId, ...query }),
                CrewService.getShipsCrewRadiusHealth({ shipId: selectedShipId }),
                CrewService.getShipsCrewRawAccounting({ shipId: selectedShipId, ...query, limit: 100 }),
            ]);
            if (isCurrentRequest(requestIds, 'crew', currentRequestId)) {
                setCrewUsers(users);
                setCrewRadiusHealth(radius);
                setCrewRawAccounting(raw);
            }
        } catch (requestError) {
            if (isCurrentRequest(requestIds, 'crew', currentRequestId)) setCrewError(getApiErrorInfo(requestError).message);
        } finally {
            if (isCurrentRequest(requestIds, 'crew', currentRequestId)) setCrewLoading(false);
        }
    }, [query, selectedShipId]);

    const fetchCrewSessions = useCallback(async (username: string) => {
        if (!selectedShipId || !username) return;
        const currentRequestId = beginRequest(requestIds, 'crewSessions');
        setCrewSelectedUsername(username);
        try {
            const nextSessions = await CrewService.getShipsCrewUsersSessions({ shipId: selectedShipId, username, limit: 100 });
            if (isCurrentRequest(requestIds, 'crewSessions', currentRequestId)) setCrewSessions(nextSessions);
        } catch (requestError) {
            if (isCurrentRequest(requestIds, 'crewSessions', currentRequestId)) setCrewError(getApiErrorInfo(requestError).message);
        }
    }, [selectedShipId]);

    // This effect synchronizes the active tab with the external API.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { if (activeTab === 'CREW') void fetchCrew(); }, [activeTab, fetchCrew]);

    const fetchBusiness = useCallback(async () => {
        if (!selectedShipId) return;
        const currentRequestId = beginRequest(requestIds, 'business');
        setBusinessLoading(true);
        setBusinessError('');
        try {
            const [devicesResponse, usageResponse, flowsResponse, unknownResponse, rawResponse] = await Promise.all([
                BusinessService.getShipsBusinessDevices({ shipId: selectedShipId, ...query }),
                BusinessService.getShipsBusinessUsage({ shipId: selectedShipId, ...query }),
                BusinessService.getShipsBusinessFlows({ shipId: selectedShipId, ...query }),
                BusinessService.getShipsBusinessFlowsUnknown({ shipId: selectedShipId, ...query, limit: 100 }),
                BusinessService.getShipsBusinessRawRecords({ shipId: selectedShipId, ...query, limit: 100 }),
            ]);
            if (isCurrentRequest(requestIds, 'business', currentRequestId)) {
                setBusinessDevices(devicesResponse);
                setBusinessUsage(usageResponse);
                setBusinessFlows(flowsResponse);
                setBusinessUnknownFlows(unknownResponse);
                setBusinessRawRecords(rawResponse);
            }
        } catch (requestError) {
            if (isCurrentRequest(requestIds, 'business', currentRequestId)) setBusinessError(getApiErrorInfo(requestError).message);
        } finally {
            if (isCurrentRequest(requestIds, 'business', currentRequestId)) setBusinessLoading(false);
        }
    }, [query, selectedShipId]);

    // This effect synchronizes the active tab with the external API.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { if (activeTab === 'BUSINESS' || activeTab === 'Traffic Flow') void fetchBusiness(); }, [activeTab, fetchBusiness]);

    const ship = shipResponse?.data;
    const meta = shipResponse?.meta;
    const shipIdentity = ship?.ship;
    const shipStatus = ship?.status ?? shipIdentity?.status;
    const period = formatPeriod(ship?.period);
    const qualityValue = ship?.data_quality?.score === null || ship?.data_quality?.score === undefined ? null : `${(ship.data_quality.score * 100).toFixed(1)}%`;
    const qualityStatus = ship?.data_quality?.score === null || ship?.data_quality?.score === undefined ? 'unknown' : ship.data_quality.status === 'PARTIAL' ? 'warning' : 'healthy';

    return (
        <div className="ship-dashboard-layout">
            <div className="ship-dashboard-columns">
                <aside className="glass-panel ship-list-panel">
                    <div className="section-heading">
                        <div><h2><Anchor size={18} /> Fleet list</h2><p>Select a ship to change the API scope.</p></div>
                        <span>{ships.length}</span>
                    </div>
                    <button type="button" className="button-secondary compact-button" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }} onClick={() => { setCreateShipError(''); setShowCreateShip(true); }}>+ Tạo tàu</button>
                    <div className="ship-list">{ships.map((item, index) => <button key={item.id ?? item.code ?? index} type="button" className={`ship-list-item ${selectedShipId === item.id ? 'selected' : ''}`} onClick={() => selectShip(item.id ?? '')}><span><strong>{item.name ?? item.code ?? item.id}</strong><small>{item.code ?? item.id}</small></span><span className={`state-badge badge-${statusClass(item.status) === 'healthy' ? 'success' : statusClass(item.status) === 'warning' ? 'warning' : 'danger'}`}>{item.status ?? 'UNKNOWN'}</span></button>)}</div>
                    {!shipsLoading && ships.length === 0 && <div className="empty-state">Chưa có tàu nào. Bấm "+ Tạo tàu" để thêm.</div>}
                </aside>

                <main className="ship-main-panel">
                    <DashboardFilters value={filters} onChange={setFilters} onApply={() => void fetchShip()} loading={shipLoading} />
                    {shipError && <DataStateNotice dataStatus="UNAVAILABLE" title="Ship dashboard request failed" description={shipError} onRetry={() => void fetchShip()} />}
                    {ship && <DataStateNotice dataStatus={ship.data_status} availability={ship.availability} quality={ship.data_quality} meta={meta} />}

                    {shipLoading && !shipResponse ? <div className="loading-block"><div className="loading-spinner" /><span>Loading ship dashboard…</span></div> : ship ? (
                        <>
                            {shipStatus === 'DECOMMISSIONED' && <div className="stale-data-banner"><ShieldAlert size={18} /><span>This ship is not reporting. Connection state is separate from traffic availability; no traffic number is inferred.</span></div>}
                            <section className="glass-panel ship-summary-header"><div><span className="eyebrow">{shipIdentity?.code ?? selectedShipId}</span><h2>{shipIdentity?.name ?? selectedShipId}</h2><p>{shipIdentity?.area?.name ?? 'Area not returned'} · {shipIdentity?.timezone ?? 'Timezone not returned'}</p></div><span className={`status-dot ${statusClass(shipStatus)}`}>{shipStatus ?? 'UNKNOWN'}</span></section>
                            <div className="dashboard-meta"><span><strong>Period:</strong> {period}</span><span><strong>Units:</strong> {ship.units ? 'bytes / bits per second / percent' : 'Not returned'}</span><span><strong>Freshness:</strong> {freshnessLabel(meta)}</span><span><strong>Data status:</strong> {ship.data_status ?? 'Not returned'}</span></div>
                            <div className="tab-row" role="tablist">{tabs.map(tab => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>

                            {activeTab === 'Overview' && <OverviewTab ship={ship} period={period} meta={meta} qualityValue={qualityValue} qualityStatus={qualityStatus} />}
                            {activeTab === 'WAN & Reconciliation' && <ReconciliationTab mode={reconciliationMode} setMode={setReconciliationMode} response={reconciliation} error={reconciliationError} loading={reconciliationLoading} period={period} granularity={filters.granularity} onRetry={() => void fetchReconciliation()} missingSources={errorMissingSources(reconciliationError)} />}
                            {activeTab === 'Interfaces' && <InterfacesTab interfaces={interfaces} loading={interfacesLoading} error={interfacesError} onRetry={() => setActiveTab('Overview')} />}
                            {activeTab === 'Devices' && <DevicesTab devices={devices} loading={devicesLoading} error={devicesError} />}
                            {activeTab === 'Health & Events' && <HealthTab health={health} healthHa={healthHa} telemetryHealth={telemetryHealth} alerts={alerts} loading={healthLoading} error={healthError} onRetry={() => void fetchHealth()} />}
                            {activeTab === 'CREW' && <CrewTab users={crewUsers} radiusHealth={crewRadiusHealth} rawAccounting={crewRawAccounting} sessions={crewSessions} selectedUsername={crewSelectedUsername} loading={crewLoading} error={crewError} onRetry={() => void fetchCrew()} onLoadSessions={username => void fetchCrewSessions(username)} />}
                            {activeTab === 'BUSINESS' && <BusinessTab devices={businessDevices} usage={businessUsage} flows={businessFlows} unknownFlows={businessUnknownFlows} rawRecords={businessRawRecords} loading={businessLoading} error={businessError} onRetry={() => void fetchBusiness()} />}
                            {activeTab === 'Traffic Flow' && <TrafficFlowTab flows={businessFlows} unknownFlows={businessUnknownFlows} rawRecords={businessRawRecords} loading={businessLoading} error={businessError} onRetry={() => void fetchBusiness()} />}
                            {activeTab === 'Configuration' && <AwaitingContract title="Ship configuration history is awaiting backend contract" endpoint="GET /devices/{deviceId}/config-revisions" detail="Service endpoint registry exists, but ship/device configuration revisions and rollout jobs are not yet exposed to this view." />}
                            {activeTab === 'Backup' && <AwaitingContract title="Device backup operations are awaiting backend contract" endpoint="GET /devices/{deviceId}/backups · POST /devices/{deviceId}/backups/restore" detail="The frontend will not claim backup freshness, restore points or failover readiness without a typed backup API." />}
                        </>
                    ) : <div className="empty-state">Select a ship to load its dashboard.</div>}
                </main>
            </div>

            {showCreateShip && (
                <div className="modal-overlay" role="dialog" onClick={closeCreateShipModal}>
                    <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
                        {!createdShipName ? (
                            <>
                                <div className="section-heading"><div><h2>Tạo tàu mới</h2></div><button type="button" className="button-secondary compact-button" onClick={closeCreateShipModal}>✕</button></div>
                                <form onSubmit={createShip} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <label className="filter-control"><span>Mã tàu</span><input className="filter-select" required value={createShipForm.code} onChange={e => setCreateShipForm({ ...createShipForm, code: e.target.value })} placeholder="vd: SHIP-01" /></label>
                                    <label className="filter-control"><span>Tên tàu</span><input className="filter-select" required value={createShipForm.name} onChange={e => setCreateShipForm({ ...createShipForm, name: e.target.value })} /></label>
                                    <label className="filter-control"><span>Trạng thái</span>
                                        <select className="filter-select" value={createShipForm.status} onChange={e => setCreateShipForm({ ...createShipForm, status: e.target.value as ShipCreateRequest.status })}>
                                            <option value={ShipCreateRequest.status.PLANNED}>PLANNED</option>
                                            <option value={ShipCreateRequest.status.COMMISSIONING}>COMMISSIONING</option>
                                            <option value={ShipCreateRequest.status.ACTIVE}>ACTIVE</option>
                                            <option value={ShipCreateRequest.status.MAINTENANCE}>MAINTENANCE</option>
                                            <option value={ShipCreateRequest.status.DECOMMISSIONED}>DECOMMISSIONED</option>
                                        </select>
                                    </label>
                                    <label className="filter-control"><span>Timezone</span><input className="filter-select" value={createShipForm.timezone} onChange={e => setCreateShipForm({ ...createShipForm, timezone: e.target.value })} /></label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <label className="filter-control" style={{ flex: 1 }}><span>IMO (tuỳ chọn)</span><input className="filter-select" value={createShipForm.imo} onChange={e => setCreateShipForm({ ...createShipForm, imo: e.target.value })} /></label>
                                        <label className="filter-control" style={{ flex: 1 }}><span>MMSI (tuỳ chọn)</span><input className="filter-select" value={createShipForm.mmsi} onChange={e => setCreateShipForm({ ...createShipForm, mmsi: e.target.value })} /></label>
                                    </div>
                                    <label className="filter-control"><span>Sức chứa thuyền viên (tuỳ chọn)</span><input className="filter-select" type="number" min={0} value={createShipForm.crew_capacity} onChange={e => setCreateShipForm({ ...createShipForm, crew_capacity: e.target.value })} /></label>

                                    {createShipError && <DataStateNotice dataStatus="UNAVAILABLE" title="Tạo tàu thất bại" description={createShipError} />}

                                    <button type="submit" className="filter-apply" disabled={savingShip}>{savingShip ? 'Đang tạo…' : 'Tạo tàu'}</button>
                                </form>
                            </>
                        ) : (
                            <>
                                <div className="section-heading"><div><h2>Đã tạo tàu "{createdShipName}"</h2><p>Dán cấu hình mẫu sau vào router mới của tàu này (Winbox/Terminal), rồi thêm thiết bị ở tab Thiết bị MikroTik để lấy script push telemetry.</p></div><button type="button" className="button-secondary compact-button" onClick={closeCreateShipModal}>✕</button></div>
                                <textarea readOnly value={DEFAULT_ROUTEROS_CONFIG_TEMPLATE} rows={12} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', background: '#0f172a', color: '#e2e8f0', resize: 'vertical' }} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                    <button type="button" className="filter-apply" onClick={() => void copyConfigTemplate()}>{configCopyFeedback ? 'Đã chép ✓' : 'Xuất cấu hình'}</button>
                                    <button type="button" className="button-secondary compact-button" onClick={closeCreateShipModal}>Xong</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

function OverviewTab({ ship, period, meta, qualityValue, qualityStatus }: { ship: NonNullable<ShipDashboardResponse['data']>; period: string; meta: ShipDashboardResponse['meta']; qualityValue: string | null; qualityStatus: MetricStatus }) {
    const devices = isRecord(ship.connectivity) && isRecord(ship.connectivity.devices) ? ship.connectivity.devices : undefined;
    const deviceTotal = devices && typeof devices.total === 'number' ? devices.total : null;
    const deviceOnline = devices && typeof devices.online === 'number' ? devices.online : null;
    const vpnStatus = isRecord(ship.connectivity) && isRecord(ship.connectivity.management_vpn) && typeof ship.connectivity.management_vpn.status === 'string' ? ship.connectivity.management_vpn.status : 'UNKNOWN';
    return <>
        <div className="grid-cards">
            <MetricCard title="Management VPN" value={vpnStatus} period="Current state" source="Ship dashboard connectivity" freshness={freshnessLabel(meta)} status={statusClass(vpnStatus)} description="Connectivity state is not a traffic counter." />
            <MetricCard title="Managed devices" value={deviceTotal} unit="devices" period="Current inventory" source="Inventory database" freshness={freshnessLabel(meta)} status="healthy" description={deviceOnline === null ? 'Online count not returned.' : `${deviceOnline} online`} />
            <MetricCard title="Data quality" value={qualityValue} unit={qualityValue ? 'of 100%' : ''} period={period} source="Telemetry quality metadata" freshness={freshnessLabel(meta)} status={qualityStatus} description="Score is null when sources are missing." />
            <MetricCard title="Traffic telemetry" value={ship.data_status === 'AVAILABLE' ? 'Available' : 'Not available'} period={period} source="Interface counters + RADIUS + IPFIX" freshness={freshnessLabel(meta)} status={ship.data_status === 'AVAILABLE' ? 'healthy' : 'unknown'} description="No /1024 conversion is applied; byte counters must come from the API." />
        </div>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2><Activity size={19} /> Operations interpretation</h2><p>Use this overview to separate inventory/connectivity from telemetry readiness.</p></div></div><div className="explanation-grid"><div><strong>What is known</strong><p>Ship identity, status, period, units, device inventory and declared missing sources.</p></div><div><strong>What is withheld</strong><p>WAN, CREW and BUSINESS byte totals are not available when the response says INSUFFICIENT_DATA.</p></div><div><strong>Next action</strong><p>Open Interfaces to verify accounting groups, then retry Reconciliation after collectors report data.</p></div></div></section>
    </>;
}

type ReconInterfaceRow = { interface_id?: string; name?: string; accounting_group?: string; download_bytes?: number | null; upload_bytes?: number | null; counter_resets?: number };
type ReconZoneRow = { accounting_group?: string; download_bytes?: number | null; upload_bytes?: number | null };
type ReconTimeseriesPoint = { bucket?: string; wan?: { download_bytes?: number | null; upload_bytes?: number | null } | null; crew?: { download_bytes?: number | null; upload_bytes?: number | null } | null; business?: { download_bytes?: number | null; upload_bytes?: number | null } | null; management?: { download_bytes?: number | null; upload_bytes?: number | null } | null };
type ReconRawRecordRow = { id?: string; interface_id?: string; observed_at?: string; rx_bytes?: number | null; tx_bytes?: number | null; counter_source?: string };
type ReconZoneKey = 'wan' | 'crew' | 'business' | 'management';
const RECON_ZONE_LABEL: Record<ReconZoneKey, string> = { wan: 'WAN (tổng)', crew: 'CREW', business: 'BUSINESS', management: 'MANAGEMENT' };

function ReconciliationTab({ mode, setMode, response, error, loading, period, granularity, onRetry, missingSources }: { mode: ReconciliationMode; setMode: (mode: ReconciliationMode) => void; response?: ReconciliationResponse | ReconciliationByWanResponse; error?: ReturnType<typeof getApiErrorInfo>; loading: boolean; period: string; granularity: DashboardGranularity; onRetry: () => void; missingSources: string[] }) {
    const [timeseriesZone, setTimeseriesZone] = useState<ReconZoneKey>('wan');
    const summary = mode === 'summary' ? (response as ReconciliationResponse | undefined)?.data : undefined;
    // Moi mode ngoai "summary" tra ve TEN FIELD RIENG (khong phai 1 "items" dung chung nhu contract
    // co the goi y -- xem backend dashboard.service.ts): by-wan/by-interface -> interfaces[],
    // by-zone -> zones[], timeseries -> points[], raw -> records[]. Doc dung ten thay vi field
    // "items" khong ton tai -- loi cu khien ca 4 mode nay luon hien bang rong du API tra du lieu that.
    const rawData = mode !== 'summary' ? (response as ReconciliationByWanResponse | undefined)?.data as Record<string, unknown> | undefined : undefined;
    const interfaceRows = (rawData?.interfaces as ReconInterfaceRow[] | undefined) ?? [];
    const zoneRows = (rawData?.zones as ReconZoneRow[] | undefined) ?? [];
    const points = (rawData?.points as ReconTimeseriesPoint[] | undefined) ?? [];
    const rawRecords = (rawData?.records as ReconRawRecordRow[] | undefined) ?? [];

    return <>
        <div className="section-heading"><div><h2><Database size={19} /> WAN & Reconciliation</h2><p>Compare WAN input with counted CREW/BUSINESS interfaces. A missing source is not a zero.</p></div><label className="filter-control"><span>View</span><select className="filter-select" value={mode} onChange={event => setMode(event.target.value as ReconciliationMode)}><option value="summary">Summary</option><option value="by-wan">By WAN</option><option value="by-interface">By interface</option><option value="by-zone">By zone</option><option value="timeseries">Volume &amp; speed over time</option><option value="raw">Raw records</option></select></label></div>
        {loading && <div className="loading-block"><div className="loading-spinner" /><span>Loading reconciliation…</span></div>}
        {!loading && error && <DataStateNotice dataStatus="UNAVAILABLE" availability={{ status: DashboardAvailability.status.UNAVAILABLE, code: DashboardAvailability.code.RECONCILIATION_UNAVAILABLE, message: error.message, missing_sources: missingSources }} title="Reconciliation telemetry is not available" description={`${error.message} The UI is withholding all gap values.`} onRetry={onRetry} />}
        {!loading && !error && summary && <SummaryReconciliation data={summary} period={period} />}

        {!loading && !error && (mode === 'by-wan' || mode === 'by-interface') && (
            <section className="glass-panel dashboard-section">
                <div className="section-heading"><div><h3>Lượng data theo interface</h3><p>Cộng gộp download + upload mỗi interface trong khoảng thời gian đã chọn.</p></div></div>
                <CategoryVolumeBarChart items={interfaceRows.map(row => ({ label: row.name ?? row.interface_id ?? '?', bytes: row.download_bytes != null || row.upload_bytes != null ? (row.download_bytes ?? 0) + (row.upload_bytes ?? 0) : null }))} />
                <div className="table-shell" style={{ marginTop: 14 }}><table className="data-table"><thead><tr><th>Interface</th><th>Accounting group</th><th>Download</th><th>Upload</th><th>Counter reset</th></tr></thead><tbody>{interfaceRows.map((row, index) => <tr key={row.interface_id ?? index}><td>{row.name ?? row.interface_id ?? 'Unknown'}</td><td>{row.accounting_group ?? 'Not assigned'}</td><td>{formatBytes(row.download_bytes).value} {formatBytes(row.download_bytes).unit}</td><td>{formatBytes(row.upload_bytes).value} {formatBytes(row.upload_bytes).unit}</td><td>{formatCount(row.counter_resets)}</td></tr>)}</tbody></table></div>
                {interfaceRows.length === 0 && <div className="empty-state">No interface records were returned for this period.</div>}
            </section>
        )}

        {!loading && !error && mode === 'by-zone' && (
            <section className="glass-panel dashboard-section">
                <div className="section-heading"><div><h3>Lượng data theo zone</h3><p>Cộng gộp download + upload mỗi accounting group trong khoảng thời gian đã chọn.</p></div></div>
                <CategoryVolumeBarChart items={zoneRows.map(row => ({ label: row.accounting_group ?? '?', bytes: row.download_bytes != null || row.upload_bytes != null ? (row.download_bytes ?? 0) + (row.upload_bytes ?? 0) : null }))} />
                <div className="table-shell" style={{ marginTop: 14 }}><table className="data-table"><thead><tr><th>Zone</th><th>Download</th><th>Upload</th></tr></thead><tbody>{zoneRows.map((row, index) => <tr key={row.accounting_group ?? index}><td>{row.accounting_group ?? 'Unknown'}</td><td>{formatBytes(row.download_bytes).value} {formatBytes(row.download_bytes).unit}</td><td>{formatBytes(row.upload_bytes).value} {formatBytes(row.upload_bytes).unit}</td></tr>)}</tbody></table></div>
                {zoneRows.length === 0 && <div className="empty-state">No zone records were returned for this period.</div>}
            </section>
        )}

        {!loading && !error && mode === 'timeseries' && (
            <section className="glass-panel dashboard-section">
                <div className="section-heading">
                    <div><h3>Lượng data tiêu thụ &amp; tốc độ theo thời gian</h3><p>Cột = byte thật mỗi bucket ({granularity}). Line = tốc độ (Mbps), suy từ byte thật ÷ độ dài bucket.</p></div>
                    <label className="filter-control"><span>Zone</span><select className="filter-select" value={timeseriesZone} onChange={event => setTimeseriesZone(event.target.value as ReconZoneKey)}>{(Object.keys(RECON_ZONE_LABEL) as ReconZoneKey[]).map(key => <option key={key} value={key}>{RECON_ZONE_LABEL[key]}</option>)}</select></label>
                </div>
                <VolumeSpeedChart granularity={granularity} points={points.map(point => ({ bucket: point.bucket, download_bytes: point[timeseriesZone]?.download_bytes ?? null, upload_bytes: point[timeseriesZone]?.upload_bytes ?? null }))} />
                {points.length === 0 && <div className="empty-state">No time-bucketed records were returned for this period.</div>}
            </section>
        )}

        {!loading && !error && mode === 'raw' && (
            <section className="glass-panel dashboard-section">
                <div className="section-heading"><div><h3>Raw interface counter samples</h3><p>Mẫu counter thô nhất (rx/tx byte tại 1 thời điểm), chưa quy đổi delta — dùng để soi dữ liệu gốc khi nghi ngờ sai lệch.</p></div></div>
                <div className="table-shell"><table className="data-table"><thead><tr><th>Observed at</th><th>Interface</th><th>RX bytes</th><th>TX bytes</th><th>Nguồn counter</th></tr></thead><tbody>{rawRecords.map((row, index) => <tr key={row.id ?? index}><td>{row.observed_at ? new Date(row.observed_at).toLocaleString('vi-VN') : 'Unknown'}</td><td>{row.interface_id ?? 'Unknown'}</td><td>{formatCount(row.rx_bytes)}</td><td>{formatCount(row.tx_bytes)}</td><td>{row.counter_source ?? 'Unknown'}</td></tr>)}</tbody></table></div>
                {rawRecords.length === 0 && <div className="empty-state">No raw records were returned for this period.</div>}
            </section>
        )}
    </>;
}

function SummaryReconciliation({ data, period }: { data: NonNullable<ReconciliationResponse['data']>; period: string }) {
    const gaps = data.gaps;
    return <>
        <DataStateNotice dataStatus={data.data_status} availability={data.availability} quality={data.data_quality} title={data.data_status === 'AVAILABLE' ? 'Reconciliation available' : 'Reconciliation is not available'} description={data.availability?.message ?? 'The API returned reconciliation metadata.'} />
        <div className="grid-cards"><MetricCard title="CREW download gap" value={formatBytes(gaps?.crew_download_gap_bytes).value} unit={formatBytes(gaps?.crew_download_gap_bytes).unit} period={period} source="Reconciliation engine" freshness="Response metadata" status={gaps?.crew_download_gap_bytes === null || gaps?.crew_download_gap_bytes === undefined ? 'unknown' : 'warning'} /><MetricCard title="CREW upload gap" value={formatBytes(gaps?.crew_upload_gap_bytes).value} unit={formatBytes(gaps?.crew_upload_gap_bytes).unit} period={period} source="Reconciliation engine" freshness="Response metadata" status={gaps?.crew_upload_gap_bytes === null || gaps?.crew_upload_gap_bytes === undefined ? 'unknown' : 'warning'} /><MetricCard title="WAN download gap" value={formatPercent(gaps?.wan_download_gap_pct)} unit="" period={period} source="Reconciliation engine" freshness="Response metadata" status={gaps?.wan_download_gap_pct === null || gaps?.wan_download_gap_pct === undefined ? 'unknown' : 'warning'} /><MetricCard title="WAN upload gap" value={formatPercent(gaps?.wan_upload_gap_pct)} unit="" period={period} source="Reconciliation engine" freshness="Response metadata" status={gaps?.wan_upload_gap_pct === null || gaps?.wan_upload_gap_pct === undefined ? 'unknown' : 'warning'} /></div>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h3>Formula and attribution</h3><p>Formula version: {data.formula_version ?? 'Not returned'} · Unattributed bytes: {formatBytes(data.unattributed_bytes).value} {formatBytes(data.unattributed_bytes).unit}</p></div></div><div className="table-shell"><table className="data-table"><thead><tr><th>Source block</th><th>Payload status</th><th>Interpretation</th></tr></thead><tbody>{(['wan', 'crew', 'business', 'management'] as const).map(key => <tr key={key}><td>{key.toUpperCase()}</td><td>{data[key] ? 'Returned' : 'Not returned'}</td><td>{data[key] ? 'Use the API payload and source metadata.' : 'Do not infer a zero from a missing object.'}</td></tr>)}</tbody></table></div></section>
    </>;
}

function InterfacesTab({ interfaces, loading, error, onRetry }: { interfaces: ShipInterface[]; loading: boolean; error: string; onRetry: () => void }) {
    if (loading) return <div className="loading-block"><div className="loading-spinner" /><span>Loading interfaces…</span></div>;
    if (error) return <DataStateNotice dataStatus="UNAVAILABLE" title="Interface request failed" description={error} onRetry={onRetry} />;
    return <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2>Interface accounting map</h2><p>Verify which interfaces are eligible for WAN/CREW/BUSINESS reconciliation before interpreting any totals.</p></div><span>{interfaces.length} interfaces</span></div><div className="table-shell"><table className="data-table"><thead><tr><th>Interface</th><th>Accounting group</th><th>Zone</th><th>Counted</th><th>Admin / oper</th><th>Speed</th><th>Counter source</th></tr></thead><tbody>{interfaces.map(item => <tr key={item.id}><td><strong>{item.name ?? item.id}</strong><div className="muted-text">{item.type ?? 'Unknown'} · {item.device_id ?? 'Device not returned'}</div></td><td>{item.accounting_group ?? 'Not assigned'}</td><td>{item.zone_id ?? 'Not assigned'}</td><td>{item.counted_in_reconciliation === undefined ? 'Not returned' : item.counted_in_reconciliation ? 'Yes' : 'No'}</td><td><span className={`status-dot ${statusClass(item.oper_state)}`}>{item.admin_state ?? 'UNKNOWN'} / {item.oper_state ?? 'UNKNOWN'}</span></td><td>{formatRate(item.speed_bps).value} {formatRate(item.speed_bps).unit}</td><td>{item.counter_source ?? 'UNKNOWN'}</td></tr>)}</tbody></table></div>{interfaces.length === 0 && <div className="empty-state">The API returned no interfaces for this ship.</div>}</section>;
}

function DevicesTab({ devices, loading, error }: { devices: Device[]; loading: boolean; error: string }) {
    if (loading) return <div className="loading-block"><div className="loading-spinner" /><span>Loading devices…</span></div>;
    if (error) return <DataStateNotice dataStatus="UNAVAILABLE" title="Device request failed" description={error} />;
    return <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2><Server size={19} /> Managed devices</h2><p>This tab uses the existing inventory contract filtered by `ship_id`; telemetry counters are separate.</p></div></div><div className="table-shell"><table className="data-table"><thead><tr><th>Device</th><th>Role</th><th>Status</th><th>RouterOS</th><th>Last seen</th></tr></thead><tbody>{devices.map(device => <tr key={device.id}><td><strong>{device.name ?? device.code ?? device.id}</strong><div className="muted-text">{device.model ?? 'Model not returned'}</div></td><td>{device.role ?? 'Not returned'}</td><td><span className={`status-dot ${statusClass(device.status)}`}>{device.status ?? 'UNKNOWN'}</span></td><td>{device.routeros_version ?? 'Not returned'}</td><td>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Not returned'}</td></tr>)}</tbody></table></div>{devices.length === 0 && <div className="empty-state">No devices are assigned to this ship.</div>}</section>;
}

function HealthTab({ health, healthHa, telemetryHealth, alerts, loading, error, onRetry }: { health?: HealthSummary; healthHa?: HealthHaResponse; telemetryHealth?: TelemetryHealthResponse; alerts: Alert[]; loading: boolean; error: string; onRetry: () => void }) {
    if (loading) return <div className="loading-block"><div className="loading-spinner" /><span>Loading health, HA and telemetry…</span></div>;
    if (error) return <DataStateNotice dataStatus="UNAVAILABLE" title="Health request failed" description={error} onRetry={onRetry} />;
    const telemetryStale = (telemetryHealth?.meta?.data_freshness_seconds ?? 0) > 300;
    const ha = healthHa?.data;
    const haRows = [
        { label: 'RADIUS', configured: ha?.radius?.configured_endpoints, required: ha?.radius?.min_required, compliant: ha?.radius?.compliant, groups: ha?.radius?.groups },
        { label: 'Database', configured: ha?.database?.configured_endpoints, required: ha?.database?.min_required, compliant: ha?.database?.compliant, groups: ha?.database?.groups },
        { label: 'Collector', configured: ha?.collector?.configured_endpoints, required: undefined, compliant: undefined, groups: ha?.collector?.groups },
        { label: 'Raw storage', configured: ha?.raw_storage?.configured_endpoints, required: undefined, compliant: undefined, groups: ha?.raw_storage?.groups },
        { label: 'Backup A/B', configured: ha?.backup_storage?.configured_targets, required: ha?.backup_storage?.min_required_targets, compliant: ha?.backup_storage?.compliant, groups: ha?.backup_storage?.groups },
    ];
    return <>
        <DataStateNotice dataStatus={health?.overall === 'HEALTHY' && telemetryHealth?.data?.status === 'HEALTHY' ? 'AVAILABLE' : 'INSUFFICIENT_DATA'} title={`Service health: ${health?.overall ?? 'UNKNOWN'}`} description="Health combines synthetic service checks, HA compliance and raw telemetry persistence health." meta={telemetryHealth?.meta} onRetry={onRetry} />
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2>Service endpoints</h2><p>RADIUS, database, collector, storage and other service health from `/health/summary`.</p></div></div><div className="table-shell"><table className="data-table"><thead><tr><th>Service</th><th>Type</th><th>Status</th><th>Healthy endpoints</th><th>Active endpoint</th><th>RTT</th></tr></thead><tbody>{(health?.services ?? []).map(service => <tr key={service.service_name}><td>{service.service_name ?? 'Unknown'}</td><td>{service.service_type ?? 'Unknown'}</td><td><span className={`status-dot ${statusClass(service.status)}`}>{service.status ?? 'UNKNOWN'}</span></td><td>{formatCount(service.healthy_endpoints)} / {formatCount(service.total_endpoints)}</td><td>{service.active_endpoint?.label ?? 'None'}</td><td>{service.active_endpoint?.rtt_ms === null || service.active_endpoint?.rtt_ms === undefined ? 'Not returned' : `${service.active_endpoint.rtt_ms} ms`}</td></tr>)}</tbody></table></div></section>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2>HA compliance and failover</h2><p>Primary/secondary and backup A/B status comes only from `/health/ha`.</p></div><span className="state-badge badge-warning">{ha ? 'REVIEW' : 'Not returned'}</span></div><div className="table-shell"><table className="data-table"><thead><tr><th>Group</th><th>Configured</th><th>Minimum</th><th>Compliant</th><th>Failover evidence</th></tr></thead><tbody>{haRows.map(row => <tr key={row.label}><td>{row.label}</td><td>{formatCount(row.configured)}</td><td>{formatCount(row.required)}</td><td>{row.compliant === undefined ? 'Not returned' : row.compliant ? 'Yes' : 'No'}</td><td>{haGroupSummary(row.groups)}</td></tr>)}</tbody></table></div></section>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2>Telemetry persistence health</h2><p>Freshness is measured from the raw telemetry store and each source; stale does not become healthy.</p></div><span className={`status-dot ${telemetryStale ? 'critical' : statusClass(telemetryHealth?.data?.status)}`}>{telemetryHealth?.data?.status ?? 'UNKNOWN'}</span></div><div className="table-shell"><table className="data-table"><thead><tr><th>Source</th><th>Status</th><th>Events</th><th>Last received</th><th>Freshness</th></tr></thead><tbody>{(telemetryHealth?.data?.sources ?? []).map(source => <tr key={source.source}><td>{source.source ?? 'UNKNOWN'}</td><td><span className={`status-dot ${statusClass(source.status)}`}>{source.status ?? 'UNKNOWN'}</span></td><td>{formatCount(source.event_count)}</td><td>{source.last_received_at ? new Date(source.last_received_at).toLocaleString() : 'Not available'}</td><td>{source.freshness_seconds === null || source.freshness_seconds === undefined ? 'Not available' : `${source.freshness_seconds}s`}</td></tr>)}</tbody></table></div>{telemetryHealth?.data?.raw_store && <div className="dashboard-meta"><span><strong>Raw store:</strong> {telemetryHealth.data.raw_store.status ?? 'UNKNOWN'}</span><span><strong>Last raw event:</strong> {telemetryHealth.data.raw_store.latest_received_at ? new Date(telemetryHealth.data.raw_store.latest_received_at).toLocaleString() : 'Not available'}</span></div>}</section>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2><ShieldAlert size={19} /> Active alerts</h2><p>Alerts are loaded from the typed `/alerts` endpoint.</p></div><span>{alerts.length}</span></div>{alerts.length === 0 ? <div className="empty-state">No firing alerts were returned.</div> : <div className="table-shell"><table className="data-table"><thead><tr><th>Severity</th><th>Title</th><th>Kind</th><th>Started</th></tr></thead><tbody>{alerts.map(alert => <tr key={alert.id}><td><span className={`state-badge badge-${alert.severity === 'CRITICAL' ? 'danger' : alert.severity === 'MAJOR' ? 'warning' : 'success'}`}>{alert.severity ?? 'UNKNOWN'}</span></td><td>{alert.title ?? 'Untitled alert'}<div className="muted-text">{alert.summary ?? 'No summary returned'}</div></td><td>{alert.kind ?? 'UNKNOWN'}</td><td>{alert.started_at ? new Date(alert.started_at).toLocaleString() : 'Not returned'}</td></tr>)}</tbody></table></div>}</section>
    </>;
}

function haGroupSummary(groups: Array<unknown> | undefined): string {
    if (!groups || groups.length === 0) return 'No group details returned';
    return groups.map((group, index) => {
        if (!isRecord(group)) return `Group ${index + 1}`;
        const service = typeof group.service_name === 'string' ? group.service_name : `Group ${index + 1}`;
        const failover = typeof group.failover_state === 'string' ? group.failover_state : 'State not returned';
        const active = typeof group.active_endpoint_id === 'string' ? group.active_endpoint_id : 'No active endpoint';
        return `${service}: ${failover}, active ${active}`;
    }).join(' · ');
}

function CrewTab({ users, radiusHealth, rawAccounting, sessions, selectedUsername, loading, error, onRetry, onLoadSessions }: { users?: CrewUsersResponse; radiusHealth?: CrewRadiusHealthResponse; rawAccounting?: CrewRawAccountingResponse; sessions?: CrewSessionsResponse; selectedUsername: string; loading: boolean; error: string; onRetry: () => void; onLoadSessions: (username: string) => void }) {
    if (loading) return <div className="loading-block"><div className="loading-spinner" /><span>Loading CREW users, RADIUS health and raw accounting…</span></div>;
    if (error) return <DataStateNotice dataStatus="UNAVAILABLE" title="CREW request failed" description={error} onRetry={onRetry} />;
    const data = users?.data;
    const radius = radiusHealth?.data;
    const identity = data?.identity_capability;
    const billing = data?.billing_reconciliation;
    return <>
        {users && <DataStateNotice dataStatus={data?.data_status} quality={data?.data_quality} meta={users.meta} title="CREW accounting state" description={`Source: ${data?.source ?? 'Not returned'} · Identity: ${identity?.status ?? 'Not returned'} (${identity?.method ?? 'Not returned'})`} onRetry={onRetry} />}
        <div className="grid-cards">
            <MetricCard title="RADIUS health" value={radius?.status ?? 'Not available'} period="Current state" source={radius?.source ?? 'RADIUS accounting'} freshness={freshnessLabel(radiusHealth?.meta)} status={statusClass(radius?.status)} description={`${formatCount(radius?.healthy_endpoints)} / ${formatCount(radius?.configured_endpoints)} healthy endpoints`} />
            <MetricCard title="RADIUS HA" value={radius?.ha_compliant === undefined ? null : radius.ha_compliant ? 'Compliant' : 'Not compliant'} period="Current state" source="RADIUS service registry" freshness={freshnessLabel(radiusHealth?.meta)} status={radius?.ha_compliant ? 'healthy' : 'warning'} description={`Minimum required: ${formatCount(radius?.min_required_endpoints)}`} />
            <MetricCard title="Accounting freshness" value={radius?.accounting_freshness_seconds === null || radius?.accounting_freshness_seconds === undefined ? null : radius.accounting_freshness_seconds} unit={radius?.accounting_freshness_seconds === null || radius?.accounting_freshness_seconds === undefined ? '' : 'seconds'} period="Current state" source="RADIUS accounting" freshness={freshnessLabel(radiusHealth?.meta)} status={radius?.accounting_freshness_seconds === null || radius?.accounting_freshness_seconds === undefined ? 'unknown' : radius.accounting_freshness_seconds > 300 ? 'warning' : 'healthy'} />
            <MetricCard title="Service/domain usage" value={data?.service_usage_capability?.status === 'AVAILABLE' ? 'Available' : 'Not available'} period={formatPeriod(data?.period)} source="DNS classifier (NetFlow + DNS log)" freshness={freshnessLabel(users?.meta)} status={data?.service_usage_capability?.status === 'AVAILABLE' ? 'healthy' : 'unknown'} description={isRecord(data?.service_usage_capability) && typeof data.service_usage_capability.message === 'string' ? data.service_usage_capability.message : 'Null service_usage/domain_usage remains Not available.'} />
            <MetricCard title="NetFlow vs RADIUS coverage" value={formatPercent(billing?.coverage_pct)} period={formatPeriod(data?.period)} source="NetFlow (measured) vs RADIUS (billing)" freshness={freshnessLabel(users?.meta)} status={billing === null || billing === undefined ? 'unknown' : 'healthy'} description={billing ? `NetFlow ${formatBytes(billing.netflow_total_bytes).value} ${formatBytes(billing.netflow_total_bytes).unit} of RADIUS ${formatBytes(billing.billing_total_bytes).value} ${formatBytes(billing.billing_total_bytes).unit} — raw ratio, not auto-scaled.` : 'No RADIUS sessions to compare against this period.'} />
        </div>
        <section className="glass-panel dashboard-section">
            <div className="section-heading"><div><h2>Danh sách user trong tàu</h2><p>Toàn bộ user hotspot/RADIUS đã gán cho thiết bị của tàu này — kể cả user chưa từng đăng nhập lần nào. Bấm "Xem chi tiết" để xem lịch sử phiên và traffic flow riêng của user đó.</p></div><span>{formatCount(data?.users?.length)} user</span></div>
            <div className="table-shell">
                <table className="data-table">
                    <thead><tr><th>Username</th><th>Gói cước</th><th>Tài khoản</th><th>Phiên hiện tại</th><th>Quota đã dùng</th><th>Dữ liệu trong kỳ</th><th>Lần cuối hoạt động</th><th></th></tr></thead>
                    <tbody>
                        {(data?.users ?? []).map(user => {
                            const pct = quotaPct(user.quota_used_bytes, user.package?.quota_gb);
                            const download = formatBytes(user.download_bytes);
                            const upload = formatBytes(user.upload_bytes);
                            const total = formatBytes(user.total_bytes);
                            const everConnected = (user.sessions_count ?? 0) > 0;
                            return (
                                <tr key={user.username}>
                                    <td><strong>{user.username ?? 'Không rõ'}</strong></td>
                                    <td>
                                        {user.package ? <><strong>{user.package.name}</strong><div className="muted-text">↓{user.package.down_mbps}/↑{user.package.up_mbps} Mbps · {user.package.quota_gb} GB</div></> : <span className="muted-text">Chưa gán gói cước</span>}
                                    </td>
                                    <td><span className={`status-dot ${subscriptionStatusClass(user.subscription_status)}`}>{user.subscription_status ?? 'Không có subscriber'}</span></td>
                                    <td>{user.status === 'ACTIVE' ? <span className="status-dot pulse healthy">Online</span> : <span className="muted-text">{everConnected ? 'Offline' : 'Chưa từng kết nối'}</span>}</td>
                                    <td>
                                        {pct === null ? <span className="muted-text">Không rõ</span> : <><span className={`status-dot ${quotaStatus(pct)}`}>{formatPercent(pct)}</span><div className="muted-text">{formatBytes(user.quota_used_bytes).value} {formatBytes(user.quota_used_bytes).unit} / {user.package?.quota_gb} GB</div></>}
                                    </td>
                                    <td><strong>{total.value} {total.unit}</strong><div className="muted-text">↓{download.value}{download.unit} · ↑{upload.value}{upload.unit}</div></td>
                                    <td>{user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : 'Chưa có'}</td>
                                    <td><button type="button" className={`button-secondary compact-button${selectedUsername === user.username ? ' active' : ''}`} disabled={!user.username} onClick={() => onLoadSessions(user.username ?? '')}>Xem chi tiết →</button></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {(data?.users ?? []).length === 0 && <div className="empty-state">Chưa có user nào gán cho thiết bị của tàu này.</div>}
        </section>
        {selectedUsername && (() => {
            const selectedUser = (data?.users ?? []).find(u => u.username === selectedUsername);
            return (
                <section className="glass-panel dashboard-section">
                    <div className="section-heading"><div><h2>Chi tiết: {selectedUsername}</h2><p>Traffic flow theo dịch vụ/tên miền (phân loại qua NetFlow + DNS log) và lịch sử phiên RADIUS của user này.</p></div></div>
                    <div className="two-column-sections">
                        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h3>Theo dịch vụ</h3></div></div>{usageChips(selectedUser?.service_usage, 'app')}</section>
                        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h3>Theo tên miền</h3></div></div>{usageChips(selectedUser?.domain_usage, 'domain')}</section>
                    </div>
                    {sessions?.data && <div className="table-shell" style={{ marginTop: 16 }}>
                        <table className="data-table">
                            <thead><tr><th>Session</th><th>Status</th><th>IP / MAC</th><th>Start</th><th>Last interim</th><th>Total</th></tr></thead>
                            <tbody>{(sessions.data.sessions ?? []).map(session => <tr key={session.id}><td>{session.acct_session_id ?? session.id ?? 'Not available'}</td><td>{session.status ?? 'UNKNOWN'}</td><td>{session.framed_ip ?? 'Not available'} / {session.calling_station_mac ?? 'Not available'}</td><td>{session.start_time ? new Date(session.start_time).toLocaleString() : 'Not available'}</td><td>{session.last_interim_at ? new Date(session.last_interim_at).toLocaleString() : 'Not available'}</td><td>{formatBytes(session.total_bytes).value} {formatBytes(session.total_bytes).unit}</td></tr>)}</tbody>
                        </table>
                        {(sessions.data.sessions ?? []).length === 0 && <div className="empty-state">User này chưa từng có phiên RADIUS nào.</div>}
                    </div>}
                </section>
            );
        })()}
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2>Raw RADIUS accounting</h2><p>Raw records are displayed as returned; no classifier or byte-direction inference is added.</p></div><span>{formatCount(rawAccounting?.data?.records?.length)} records</span></div>{(rawAccounting?.data?.records ?? []).length === 0 ? <div className="empty-state">No raw accounting records were returned.</div> : <div className="raw-record-list">{(rawAccounting?.data?.records ?? []).map((record, index) => <code key={index}>{JSON.stringify(record)}</code>)}</div>}</section>
    </>;
}

function BusinessTab({ devices, usage, flows, unknownFlows, rawRecords, loading, error, onRetry }: { devices?: BusinessDevicesResponse; usage?: BusinessUsageResponse; flows?: BusinessFlowsResponse; unknownFlows?: BusinessRawRecordsResponse; rawRecords?: BusinessRawRecordsResponse; loading: boolean; error: string; onRetry: () => void }) {
    if (loading) return <div className="loading-block"><div className="loading-spinner" /><span>Loading BUSINESS devices, usage and flows…</span></div>;
    if (error) return <DataStateNotice dataStatus="UNAVAILABLE" title="BUSINESS request failed" description={error} onRetry={onRetry} />;
    const deviceData = devices?.data;
    const flowData = flows?.data;
    const identity = deviceData?.identity_capability ?? flowData?.identity_capability;
    return <>
        <DataStateNotice dataStatus={deviceData?.data_status ?? flowData?.data_status ?? usage?.data?.data_status} quality={deviceData?.data_quality ?? flowData?.data_quality ?? usage?.data?.data_quality} meta={flows?.meta ?? devices?.meta ?? usage?.meta} title="BUSINESS identity and data state" description={`Identity capability: ${identity?.status ?? 'Not returned'} · ${identity?.message ?? 'No identity message returned'}`} onRetry={onRetry} />
        <div className="grid-cards"><MetricCard title="BUSINESS total bytes" value={formatBytes(flowData?.total_bytes).value} unit={formatBytes(flowData?.total_bytes).unit} period={formatPeriod(flowData?.period)} source={flowData?.source ?? 'IPFIX_FLOW'} freshness={freshnessLabel(flows?.meta)} status={flowData?.total_bytes === null || flowData?.total_bytes === undefined ? 'unknown' : 'healthy'} /><MetricCard title="Flow count" value={formatCount(flowData?.flow_count)} unit="flows" period={formatPeriod(flowData?.period)} source={flowData?.source ?? 'IPFIX_FLOW'} freshness={freshnessLabel(flows?.meta)} status="healthy" /><MetricCard title="Unattributed bytes" value={formatBytes(flowData?.unattributed_bytes).value} unit={formatBytes(flowData?.unattributed_bytes).unit} period={formatPeriod(flowData?.period)} source="BUSINESS flows" freshness={freshnessLabel(flows?.meta)} status={flowData?.unattributed_bytes === null || flowData?.unattributed_bytes === undefined ? 'unknown' : 'warning'} description={`Classification: ${flowData?.classification_method ?? 'Not returned'}`} /><MetricCard title="Unknown reason" value={flowData?.unknown_reason ?? 'Not available'} period={formatPeriod(flowData?.period)} source="BUSINESS flows" freshness={freshnessLabel(flows?.meta)} status={flowData?.unknown_reason ? 'warning' : 'unknown'} /></div>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2>BUSINESS devices</h2><p>Identity is IP/MAC/VLAN. Username is intentionally not displayed or inferred.</p></div><span>{formatCount(deviceData?.devices?.length)} devices</span></div><div className="table-shell"><table className="data-table"><thead><tr><th>IP</th><th>MAC</th><th>VLAN</th><th>Total bytes</th><th>Flow count</th><th>Last seen</th><th>Identity</th></tr></thead><tbody>{(deviceData?.devices ?? []).map(device => <tr key={`${device.ip}-${device.vlan_id}`}><td>{device.ip ?? 'Not available'}</td><td>{device.mac ?? 'Not available'}</td><td>{device.vlan_id === null || device.vlan_id === undefined ? 'Not available' : device.vlan_id}</td><td>{formatBytes(device.total_bytes).value} {formatBytes(device.total_bytes).unit}</td><td>{formatCount(device.flow_count)}</td><td>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : 'Not available'}</td><td>{device.identity_capability?.status ?? 'Not returned'}</td></tr>)}</tbody></table></div></section>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2>Top destinations</h2><p>Destination fields are shown exactly from the BUSINESS flow summary.</p></div></div><div className="table-shell"><table className="data-table"><thead><tr><th>Destination</th><th>Bytes</th><th>Flows</th></tr></thead><tbody>{(flowData?.top_destinations ?? []).map(destination => <tr key={destination.dst_ip}><td>{destination.dst_ip ?? 'Not available'}</td><td>{formatBytes(destination.bytes).value} {formatBytes(destination.bytes).unit}</td><td>{formatCount(destination.flow_count)}</td></tr>)}</tbody></table></div></section>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h2>Usage buckets</h2><p>Direction values remain unavailable if the API returns null; no direction is inferred from total bytes.</p></div></div><div className="table-shell"><table className="data-table"><thead><tr><th>Bucket</th><th>Download</th><th>Upload</th><th>Total</th><th>Counter resets</th></tr></thead><tbody>{(usage?.data?.points ?? []).map(point => <tr key={point.bucket}><td>{point.bucket ?? 'Not available'}</td><td>{formatBytes(point.download_bytes).value} {formatBytes(point.download_bytes).unit}</td><td>{formatBytes(point.upload_bytes).value} {formatBytes(point.upload_bytes).unit}</td><td>{formatBytes(point.total_bytes).value} {formatBytes(point.total_bytes).unit}</td><td>{formatCount(point.counter_resets)}</td></tr>)}</tbody></table></div></section>
        <BusinessClassificationSections flows={flows} />
        <BusinessRawSections unknownFlows={unknownFlows} rawRecords={rawRecords} />
    </>;
}

function TrafficFlowTab({ flows, unknownFlows, rawRecords, loading, error, onRetry }: { flows?: BusinessFlowsResponse; unknownFlows?: BusinessRawRecordsResponse; rawRecords?: BusinessRawRecordsResponse; loading: boolean; error: string; onRetry: () => void }) {
    if (loading) return <div className="loading-block"><div className="loading-spinner" /><span>Loading BUSINESS flow summary…</span></div>;
    if (error) return <DataStateNotice dataStatus="UNAVAILABLE" title="Traffic Flow request failed" description={error} onRetry={onRetry} />;
    const data = flows?.data;
    return <>
        <DataStateNotice dataStatus={data?.data_status} quality={data?.data_quality} meta={flows?.meta} title="Traffic Flow source" description="This tab uses the contract-defined BUSINESS flow endpoints; no generic `/ships/{shipId}/flows/summary` URL is guessed." onRetry={onRetry} />
        <div className="grid-cards"><MetricCard title="Flow count" value={formatCount(data?.flow_count)} unit="flows" period={formatPeriod(data?.period)} source={data?.source ?? 'IPFIX_FLOW'} freshness={freshnessLabel(flows?.meta)} status="healthy" /><MetricCard title="Total bytes" value={formatBytes(data?.total_bytes).value} unit={formatBytes(data?.total_bytes).unit} period={formatPeriod(data?.period)} source={data?.source ?? 'IPFIX_FLOW'} freshness={freshnessLabel(flows?.meta)} status={data?.total_bytes === null || data?.total_bytes === undefined ? 'unknown' : 'healthy'} /><MetricCard title="Unknown classification" value={data?.unknown_reason ?? 'Not available'} period={formatPeriod(data?.period)} source="BUSINESS flows" freshness={freshnessLabel(flows?.meta)} status={data?.unknown_reason ? 'warning' : 'unknown'} /></div>
        <BusinessClassificationSections flows={flows} />
        <BusinessRawSections unknownFlows={unknownFlows} rawRecords={rawRecords} />
    </>;
}

// by_app/by_domain — DNS-classifier breakdown, shared between the BUSINESS and Traffic Flow tabs
// since both render the same BusinessFlowsResponse.
function BusinessClassificationSections({ flows }: { flows?: BusinessFlowsResponse }) {
    const data = flows?.data;
    const byApp = data?.by_app ?? [];
    const byDomain = data?.by_domain ?? [];
    return <div className="two-column-sections">
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h3>By service</h3><p>DNS-classified bytes grouped by cataloged service name; "Khác" is a known domain with no catalog match.</p></div><span>{formatCount(byApp.length)} services</span></div>{byApp.length === 0 ? <div className="empty-state">No DNS-classified traffic yet — see classification_method/unknown_reason above.</div> : <div className="table-shell"><table className="data-table"><thead><tr><th>Service</th><th>Bytes</th><th>Flows</th></tr></thead><tbody>{byApp.map(row => <tr key={row.app}><td>{row.app ?? 'Not available'}</td><td>{formatBytes(row.bytes).value} {formatBytes(row.bytes).unit}</td><td>{formatCount(row.flow_count)}</td></tr>)}</tbody></table></div>}</section>
        <section className="glass-panel dashboard-section"><div className="section-heading"><div><h3>By domain</h3><p>Top 10 DNS-resolved domains by bytes, regardless of service catalog match.</p></div><span>{formatCount(byDomain.length)} domains</span></div>{byDomain.length === 0 ? <div className="empty-state">No DNS-resolved domains yet.</div> : <div className="table-shell"><table className="data-table"><thead><tr><th>Domain</th><th>Bytes</th><th>Flows</th></tr></thead><tbody>{byDomain.map(row => <tr key={row.domain}><td>{row.domain ?? 'Not available'}</td><td>{formatBytes(row.bytes).value} {formatBytes(row.bytes).unit}</td><td>{formatCount(row.flow_count)}</td></tr>)}</tbody></table></div>}</section>
    </div>;
}

function BusinessRawSections({ unknownFlows, rawRecords }: { unknownFlows?: BusinessRawRecordsResponse; rawRecords?: BusinessRawRecordsResponse }) {
    return <div className="two-column-sections"><section className="glass-panel dashboard-section"><div className="section-heading"><div><h3>Unknown flows</h3><p>Unknown reason and raw attributes are kept visible for classifier follow-up.</p></div><span>{formatCount(unknownFlows?.data?.records?.length)} records</span></div>{(unknownFlows?.data?.records ?? []).length === 0 ? <div className="empty-state">No unknown flow records returned.</div> : <div className="raw-record-list">{(unknownFlows?.data?.records ?? []).map((record, index) => <code key={index}>{JSON.stringify(record)}</code>)}</div>}</section><section className="glass-panel dashboard-section"><div className="section-heading"><div><h3>Raw flow records</h3><p>Source: {rawRecords?.data?.source ?? 'Not returned'} · Identity capability is not enhanced here.</p></div><span>{formatCount(rawRecords?.data?.records?.length)} records</span></div>{(rawRecords?.data?.records ?? []).length === 0 ? <div className="empty-state">No raw flow records returned.</div> : <div className="raw-record-list">{(rawRecords?.data?.records ?? []).map((record, index) => <code key={index}>{JSON.stringify(record)}</code>)}</div>}</section></div>;
}
