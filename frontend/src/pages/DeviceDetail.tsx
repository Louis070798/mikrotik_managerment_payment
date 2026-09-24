import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    Activity, ArrowDown, ArrowUp, Cable, CircleCheck, CircleHelp, CirclePause, CircleX, Database,
    Check, Clock, Copy, Cpu, EthernetPort, Eye, EyeOff, Gauge, Network, Plug, Server, Shuffle, Terminal, TriangleAlert, User, UserCheck, Users, Wifi,
} from 'lucide-react';
import { CrewService, InterfacesService, InventoryService, PackagesService, SettingsService, SubscribersService } from '../api';
import type { Device } from '../api/models/Device';
import type { Interface as ShipInterface } from '../api/models/Interface';
import type { DeviceTraffic } from '../api/models/DeviceTraffic';
import type { DeviceInterfaceTraffic } from '../api/models/DeviceInterfaceTraffic';
import type { CrewUser } from '../api/models/CrewUser';
import type { Subscriber } from '../api/models/Subscriber';
import type { Package } from '../api/models/Package';
import type { SettingsResponse } from '../api/models/SettingsResponse';
import { DataStateNotice } from '../components/DataStateNotice';
import { MetricCard } from '../components/MetricCard';
import { MiniStat } from '../components/MiniStat';
import { VolumeSpeedChart } from '../components/VolumeSpeedChart';
import { bytesToRateBps, combineBytes, formatBytes, formatLastSeen, formatRate, getApiErrorInfo, type DashboardGranularity } from '../lib/dashboard';
import { generateRandomHex } from '../lib/randomToken';
import { buildRouterOsFullConfig, routerOsFullConfigBlockers } from '../lib/routerosFleetCommands';

type TrafficRange = '5m' | '1d' | '3d' | '7d' | '30d';
type Tab = 'Traffic' | 'Interface' | 'Người dùng' | 'Kết nối trực tiếp';

const RANGE_OPTIONS: { key: TrafficRange; label: string; ms: number; granularity: DashboardGranularity }[] = [
    { key: '5m', label: '5 phút', ms: 5 * 60 * 1000, granularity: '1m' },
    { key: '1d', label: '1 ngày', ms: 24 * 60 * 60 * 1000, granularity: '5m' },
    { key: '3d', label: '3 ngày', ms: 3 * 24 * 60 * 60 * 1000, granularity: '1h' },
    { key: '7d', label: '7 ngày', ms: 7 * 24 * 60 * 60 * 1000, granularity: '1d' },
    { key: '30d', label: '30 ngày', ms: 30 * 24 * 60 * 60 * 1000, granularity: '1d' },
];
const tabs: Tab[] = ['Traffic', 'Interface', 'Người dùng', 'Kết nối trực tiếp'];

/**
 * Sinh script RouterOS thật để dán vào System > Scheduler — model push 1 chiều (xem
 * migrations/control/0007, DEVICE_PUSH_* trong errors.ts). Router tự đọc rx-byte/tx-byte từng
 * interface, tự ghép JSON (RouterOS không có serializer sẵn) rồi POST bằng /tool fetch mỗi 5 phút.
 * Server không bao giờ chủ động kết nối ngược vào router.
 */
function statusOf(state?: string): 'healthy' | 'warning' | 'critical' | 'unknown' {
    if (state === 'ONLINE' || state === 'UP') return 'healthy';
    if (state === 'DEGRADED') return 'warning';
    if (state === 'OFFLINE' || state === 'DOWN') return 'critical';
    return 'unknown';
}

const TAB_ICONS: Record<Tab, React.ReactNode> = {
    Traffic: <Activity size={15} />,
    Interface: <Network size={15} />,
    'Người dùng': <Users size={15} />,
    'Kết nối trực tiếp': <Plug size={15} />,
};

// Icon theo loại interface thật (RouterOS iface.type) — chỉ để nhận diện nhanh bằng mắt, không suy
// diễn thêm thông tin gì ngoài tên loại router đã báo.
function ifaceTypeIcon(type?: string | null) {
    const t = (type ?? '').toLowerCase();
    if (t.includes('wlan') || t.includes('wifi') || t.includes('wireless')) return <Wifi size={14} />;
    if (t.includes('bridge') || t.includes('vlan') || t.includes('bond')) return <Network size={14} />;
    if (t.includes('ether')) return <EthernetPort size={14} />;
    return <Cable size={14} />;
}

const STATUS_ICON: Record<'healthy' | 'warning' | 'critical' | 'unknown', { Icon: typeof CircleCheck; color: string }> = {
    healthy: { Icon: CircleCheck, color: 'var(--success)' },
    warning: { Icon: TriangleAlert, color: 'var(--warning)' },
    critical: { Icon: CircleX, color: 'var(--danger)' },
    unknown: { Icon: CircleHelp, color: 'var(--text-muted)' },
};

function StatusIcon({ state, size = 14 }: { state?: string; size?: number }) {
    const { Icon, color } = STATUS_ICON[statusOf(state)];
    return <Icon size={size} color={color} style={{ flex: 'none' }} />;
}

export const DeviceDetail: React.FC = () => {
    const { deviceId } = useParams<{ deviceId: string }>();
    const [device, setDevice] = useState<Device>();
    const [interfaces, setInterfaces] = useState<ShipInterface[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<Tab>('Traffic');

    const [range, setRange] = useState<TrafficRange>('1d');
    const [traffic, setTraffic] = useState<DeviceTraffic>();
    const [trafficLoading, setTrafficLoading] = useState(true);
    const [trafficError, setTrafficError] = useState('');

    // User hotspot lay tu RADIUS (endpoint CREW chi co o cap TAU) roi giao voi danh sach subscriber
    // co nas_device_id = thiet bi nay -- de bang chi con user thuc su quay so qua router nay.
    const [crewUsers, setCrewUsers] = useState<CrewUser[]>([]);
    const [crewLoading, setCrewLoading] = useState(true);
    const [crewError, setCrewError] = useState('');

    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [usersError, setUsersError] = useState('');

    // Bandwidth + tổng data theo TỪNG interface (tab Interface) — dùng chung range với tab Traffic.
    const [interfaceTraffic, setInterfaceTraffic] = useState<DeviceInterfaceTraffic>();
    const [interfaceTrafficLoading, setInterfaceTrafficLoading] = useState(true);
    const [interfaceTrafficError, setInterfaceTrafficError] = useState('');
    const [ifaceViewMode, setIfaceViewMode] = useState<'chart' | 'table'>('chart');

    // Tab "Kết nối trực tiếp" — model push 1 chiều: router tự đẩy telemetry lên server.
    const [ipInput, setIpInput] = useState('');
    const [ipSaving, setIpSaving] = useState(false);
    const [ipSaveError, setIpSaveError] = useState('');
    const [ipSavedAt, setIpSavedAt] = useState<number>();
    const [newPushKeyInput, setNewPushKeyInput] = useState('');
    const [keyBusy, setKeyBusy] = useState(false);
    const [keyError, setKeyError] = useState('');
    const [keySaved, setKeySaved] = useState(false);
    const [newRadiusSecretInput, setNewRadiusSecretInput] = useState('');
    const [radiusSecretBusy, setRadiusSecretBusy] = useState(false);
    const [radiusSecretError, setRadiusSecretError] = useState('');
    const [radiusSecretSaved, setRadiusSecretSaved] = useState(false);
    // Secret that CHI duoc tai khi admin bam "Hien" -- moi lan tai deu ghi audit
    // device.radius_secret_reveal, nen khong prefetch san luc mo trang.
    const [revealedSecret, setRevealedSecret] = useState<string>();
    const [revealBusy, setRevealBusy] = useState(false);
    const [revealError, setRevealError] = useState('');
    // Dia chi/cong server RADIUS (Settings) -- can de sinh lenh "/radius add address=..." dung.
    const [radiusSettings, setRadiusSettings] = useState<SettingsResponse['data']>();
    const [copyFeedback, setCopyFeedback] = useState<string>();
    const [serverUrl, setServerUrl] = useState(() => {
        const { protocol, hostname, port } = window.location;
        // Dev: FE chạy ở 5173 (Vite), BE thật nghe ở 3000 (theo vite.config.ts proxy của repo này).
        // Production: nếu FE/BE chung origin (reverse proxy) thì giữ nguyên origin hiện tại.
        // Đây chỉ là phỏng đoán ban đầu — người dùng tự sửa nếu router thật cần một địa chỉ khác.
        const guessedPort = port === '5173' ? '3000' : port;
        return `${protocol}//${hostname}${guessedPort ? ':' + guessedPort : ''}/api/v1`;
    });

    const rangeOption = RANGE_OPTIONS.find(r => r.key === range)!;

    const fetchData = useCallback(async () => {
        if (!deviceId) return;
        setLoading(true);
        setError('');
        try {
            const res = await InventoryService.getDevices1({ deviceId });
            setDevice(res.data);
            if (res.data?.ship_id) {
                const ifaceRes = await InterfacesService.getShipsInterfaces({ shipId: res.data.ship_id });
                setInterfaces((ifaceRes.data ?? []).filter(i => i.device_id === deviceId));
            }
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setLoading(false);
        }
    }, [deviceId]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    useEffect(() => { setIpInput(device?.ip_address ?? ''); }, [device?.ip_address]);

    const saveIpAddress = useCallback(async () => {
        if (!deviceId) return;
        setIpSaving(true);
        setIpSaveError('');
        try {
            const res = await InventoryService.patchDevices({ deviceId, requestBody: { ip_address: ipInput.trim() || null } });
            setDevice(res.data);
            setIpSavedAt(Date.now());
        } catch (requestError) {
            setIpSaveError(getApiErrorInfo(requestError).message);
        } finally {
            setIpSaving(false);
        }
    }, [deviceId, ipInput]);

    const setPushKey = useCallback(async () => {
        if (!deviceId || newPushKeyInput.length < 8) return;
        setKeyBusy(true);
        setKeyError('');
        try {
            await InventoryService.postDevicesPushKey({ deviceId, requestBody: { api_key: newPushKeyInput } });
            // KHONG xoa o nhap sau khi luu (khac Subscriber/Tenant) -- gia tri nay con can hien trong
            // script RouterOS ben duoi de admin copy nguyen ca script dan vao router.
            setKeySaved(true);
            setTimeout(() => setKeySaved(false), 2500);
            const fresh = await InventoryService.getDevices1({ deviceId });
            setDevice(fresh.data);
        } catch (requestError) {
            setKeyError(getApiErrorInfo(requestError).message);
        } finally {
            setKeyBusy(false);
        }
    }, [deviceId, newPushKeyInput]);

    const revokeKey = useCallback(async () => {
        if (!deviceId) return;
        setKeyBusy(true);
        setKeyError('');
        try {
            await InventoryService.deleteDevicesPushKey({ deviceId });
            const fresh = await InventoryService.getDevices1({ deviceId });
            setDevice(fresh.data);
        } catch (requestError) {
            setKeyError(getApiErrorInfo(requestError).message);
        } finally {
            setKeyBusy(false);
        }
    }, [deviceId]);

    const setRadiusSecretValue = useCallback(async () => {
        if (!deviceId || newRadiusSecretInput.length < 4) return;
        setRadiusSecretBusy(true);
        setRadiusSecretError('');
        try {
            await InventoryService.postDevicesRadiusSecret({ deviceId, requestBody: { secret: newRadiusSecretInput } });
            // KHONG xoa o nhap sau khi luu -- admin can go dung gia tri nay vao "/radius add secret=..."
            // tren router, xoa ngay se mat dau vet vua go gi.
            // Hien gia tri MOI luon, de khoi lenh RouterOS ben duoi khong con dan secret cu.
            setRevealedSecret(newRadiusSecretInput);
            setRadiusSecretSaved(true);
            setTimeout(() => setRadiusSecretSaved(false), 2500);
            const fresh = await InventoryService.getDevices1({ deviceId });
            setDevice(fresh.data);
        } catch (requestError) {
            setRadiusSecretError(getApiErrorInfo(requestError).message);
        } finally {
            setRadiusSecretBusy(false);
        }
    }, [deviceId, newRadiusSecretInput]);

    const revokeRadiusSecret = useCallback(async () => {
        if (!deviceId) return;
        setRadiusSecretBusy(true);
        setRadiusSecretError('');
        try {
            await InventoryService.deleteDevicesRadiusSecret({ deviceId });
            setRevealedSecret(undefined);
            const fresh = await InventoryService.getDevices1({ deviceId });
            setDevice(fresh.data);
        } catch (requestError) {
            setRadiusSecretError(getApiErrorInfo(requestError).message);
        } finally {
            setRadiusSecretBusy(false);
        }
    }, [deviceId]);

    const revealRadiusSecret = useCallback(async () => {
        if (!deviceId) return;
        setRevealBusy(true);
        setRevealError('');
        try {
            const res = await InventoryService.getDevicesRadiusSecret({ deviceId });
            setRevealedSecret(res.data?.secret);
        } catch (requestError) {
            setRevealError(getApiErrorInfo(requestError).message);
        } finally {
            setRevealBusy(false);
        }
    }, [deviceId]);

    const copyText = useCallback(async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyFeedback(label);
            setTimeout(() => setCopyFeedback(undefined), 2000);
        } catch {
            setCopyFeedback(undefined);
        }
    }, []);

    const fetchTraffic = useCallback(async () => {
        if (!deviceId) return;
        setTrafficLoading(true);
        setTrafficError('');
        try {
            const to = new Date();
            const from = new Date(to.getTime() - rangeOption.ms);
            const res = await InventoryService.getDevicesTraffic({
                deviceId,
                from: from.toISOString(),
                to: to.toISOString(),
                granularity: rangeOption.granularity,
            });
            setTraffic(res.data);
        } catch (requestError) {
            setTrafficError(getApiErrorInfo(requestError).message);
        } finally {
            setTrafficLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceId, range]);

    useEffect(() => { if (activeTab === 'Traffic') void fetchTraffic(); }, [activeTab, fetchTraffic]);

    const fetchCrew = useCallback(async () => {
        if (!deviceId) return;
        const shipId = device?.ship_id;
        if (!shipId) { setCrewUsers([]); setCrewLoading(false); return; }
        setCrewLoading(true);
        setCrewError('');
        try {
            const to = new Date();
            const from = new Date(to.getTime() - rangeOption.ms);
            const [crewRes, subRes] = await Promise.all([
                CrewService.getShipsCrewUsers({
                    shipId,
                    from: from.toISOString(),
                    to: to.toISOString(),
                    granularity: rangeOption.granularity,
                }),
                SubscribersService.getSubscribers({ nasDeviceId: deviceId }),
            ]);
            const deviceUsernames = new Set((subRes.data ?? []).map(sub => sub.username).filter((u): u is string => !!u));
            const all = crewRes.data?.users ?? [];
            // Chi giu user RADIUS cua tau co subscriber tro NAS ve dung thiet bi nay.
            setCrewUsers(all.filter(user => user.username && deviceUsernames.has(user.username)));
        } catch (requestError) {
            setCrewError(getApiErrorInfo(requestError).message);
        } finally {
            setCrewLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceId, device?.ship_id, range]);

    useEffect(() => { if (activeTab === 'Traffic') void fetchCrew(); }, [activeTab, fetchCrew]);

    const fetchInterfaceTraffic = useCallback(async () => {
        if (!deviceId) return;
        setInterfaceTrafficLoading(true);
        setInterfaceTrafficError('');
        try {
            const to = new Date();
            const from = new Date(to.getTime() - rangeOption.ms);
            const res = await InventoryService.getDevicesInterfacesTraffic({
                deviceId,
                from: from.toISOString(),
                to: to.toISOString(),
                granularity: rangeOption.granularity,
            });
            setInterfaceTraffic(res.data);
        } catch (requestError) {
            setInterfaceTrafficError(getApiErrorInfo(requestError).message);
        } finally {
            setInterfaceTrafficLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceId, range]);

    useEffect(() => { if (activeTab === 'Interface') void fetchInterfaceTraffic(); }, [activeTab, fetchInterfaceTraffic]);

    const fetchUsers = useCallback(async () => {
        if (!deviceId) return;
        setUsersLoading(true);
        setUsersError('');
        try {
            const [subRes, pkgRes] = await Promise.all([
                SubscribersService.getSubscribers({ nasDeviceId: deviceId }),
                PackagesService.getPackages({}),
            ]);
            setSubscribers(subRes.data ?? []);
            setPackages(pkgRes.data ?? []);
        } catch (requestError) {
            setUsersError(getApiErrorInfo(requestError).message);
        } finally {
            setUsersLoading(false);
        }
    }, [deviceId]);

    useEffect(() => { if (activeTab === 'Người dùng') void fetchUsers(); }, [activeTab, fetchUsers]);

    const fetchRadiusSettings = useCallback(async () => {
        try {
            const res = await SettingsService.getSettings();
            setRadiusSettings(res.data);
        } catch {
            // Thieu quyen settings:read hoac DB dang down -- khong chan ca tab, chi lam lenh sinh ra
            // con cho trong va routerOsRadiusBlockers() se noi ro thieu gi.
            setRadiusSettings(undefined);
        }
    }, []);

    useEffect(() => { if (activeTab === 'Kết nối trực tiếp') void fetchRadiusSettings(); }, [activeTab, fetchRadiusSettings]);

    // .wan.download_bytes/.upload_bytes moi bucket -- dung nguyen cho VolumeSpeedChart (component
    // dung chung, tu tinh ca bieu do cot khoi luong lan bieu do line toc do tu points tho nay).
    const wanVolumePoints = useMemo(
        () => (traffic?.points ?? []).map(point => ({ bucket: point.bucket, download_bytes: point.wan?.download_bytes, upload_bytes: point.wan?.upload_bytes })),
        [traffic],
    );

    const IFACE_CHART_COLORS = ['#146ca8', '#00a0a6', '#d97706', '#be123c', '#7c3aed', '#4d7c0f', '#db2777', '#0284c7', '#a16207', '#9333ea', '#15803d', '#7e22ce'];

    // Gộp toàn bộ interface vào 1 chuỗi bucket dùng chung để vẽ nhiều đường trên 1 biểu đồ — mỗi
    // đường là bandwidth (rx+tx gộp, Mbps) của 1 interface thật.
    const interfaceChartData = useMemo(() => {
        const list = interfaceTraffic?.interfaces ?? [];
        const granularity = interfaceTraffic?.period?.granularity ?? rangeOption.granularity;
        const bucketSet = new Set<string>();
        list.forEach(iface => (iface.points ?? []).forEach(p => { if (p.bucket) bucketSet.add(p.bucket); }));
        const buckets = [...bucketSet].sort();
        return buckets.map(bucketIso => {
            const row: Record<string, number | string> = {
                time: new Date(bucketIso).toLocaleString('vi-VN', range === '5m' || range === '1d' ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit' }),
            };
            for (const iface of list) {
                const point = (iface.points ?? []).find(p => p.bucket === bucketIso);
                const combinedBytes = (point?.rx_bytes ?? 0) + (point?.tx_bytes ?? 0);
                row[iface.name ?? iface.interface_id ?? '?'] = Math.round(((bytesToRateBps(combinedBytes, granularity) ?? 0) / 1_000_000) * 1000) / 1000;
            }
            return row;
        });
    }, [interfaceTraffic, rangeOption.granularity, range]);

    // Tổng data cộng dồn từ 00:00 UTC ngày 1 của tháng hiện tại (reset tự nhiên mỗi tháng, backend
    // tính lại theo mốc thời gian thật) + nguyên văn mẫu counter gần nhất MikroTik gửi lên — mọi
    // trường ở đây là dữ liệu thật nhận được, không suy diễn thêm.
    const monthTotalByIfaceId = useMemo(() => {
        const map = new Map<string, { rx: number | null; tx: number | null; total: number | null; latest: NonNullable<DeviceInterfaceTraffic['interfaces']>[number]['latest_sample'] }>();
        (interfaceTraffic?.interfaces ?? []).forEach(iface => {
            if (iface.interface_id) {
                map.set(iface.interface_id, {
                    rx: iface.month_total?.rx_bytes ?? null,
                    tx: iface.month_total?.tx_bytes ?? null,
                    total: iface.month_total?.total_bytes ?? null,
                    latest: iface.latest_sample ?? null,
                });
            }
        });
        return map;
    }, [interfaceTraffic]);


    const packageName = (id?: string | null) => packages.find(p => p.id === id)?.name ?? 'Không rõ';
    const totalUserQuota = subscribers.reduce((sum, s) => sum + (s.quota_used_bytes ?? 0), 0);
    const activeUserCount = subscribers.filter(s => s.status === 'ACTIVE').length;

    // Gop download+upload thanh 1 con so "tong data" -- trang nay khong can phan biet chieu, chi
    // trang chi tiet ship (tab WAN & Reconciliation) moi can tach rieng tung chieu de dien doan.
    const wanTotal = formatBytes(combineBytes(traffic?.wan?.download_bytes, traffic?.wan?.upload_bytes));
    const wanDownload = formatBytes(traffic?.wan?.download_bytes);
    const wanUpload = formatBytes(traffic?.wan?.upload_bytes);
    const wanStatus = traffic?.wan?.download_bytes == null && traffic?.wan?.upload_bytes == null ? 'unknown' as const : 'healthy' as const;

    // Xep theo tong byte giam dan -- bang user hotspot doc tu tren xuong la "ai dung nhieu nhat".
    const crewSorted = useMemo(() => [...crewUsers].sort((a, b) => (b.total_bytes ?? 0) - (a.total_bytes ?? 0)), [crewUsers]);
    const crewTotalBytes = useMemo(() => crewUsers.reduce((sum, user) => sum + (user.total_bytes ?? 0), 0), [crewUsers]);
    const crewMaxBytes = crewSorted[0]?.total_bytes ?? 0;
    const crewTotal = formatBytes(crewTotalBytes);
    const crewActiveCount = crewUsers.filter(user => user.status === 'ACTIVE').length;
    const crewBarPct = (value?: number | null) => (!value || crewMaxBytes <= 0 ? 0 : Math.max(2, Math.round((value / crewMaxBytes) * 100)));

    // Lenh RouterOS khai bao chinh thiet bi nay lam RADIUS client. secret chi co gia tri that sau
    // khi admin bam "Hien secret" -- truoc do lenh co san cho trong, khong bia gia tri gia.
    const fullConfigInput = {
        serverAddress: radiusSettings?.radius_server_address,
        authPort: radiusSettings?.radius_auth_port,
        acctPort: radiusSettings?.radius_acct_port,
        coaPort: radiusSettings?.radius_coa_port,
        secret: revealedSecret,
        nasIpAddress: device?.ip_address,
        deviceName: device?.name ?? device?.code,
        deviceId,
        pushApiKey: newPushKeyInput || undefined,
        telemetryUrl: deviceId ? `${serverUrl.replace(/\/+$/, '')}/devices/${deviceId}/telemetry-push` : undefined,
    };
    const fullConfigText = buildRouterOsFullConfig(fullConfigInput);
    const fullConfigBlockers = routerOsFullConfigBlockers(fullConfigInput);

    return (
        <div>
            <div className="top-bar">
                <div>
                    <Link to="/devices" className="muted-text">← Quay lại danh sách thiết bị</Link>
                    <h1>{device?.name ?? 'Chi tiết thiết bị'}</h1>
                </div>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được thông tin thiết bị" description={error} onRetry={() => void fetchData()} />}

            {loading && !device ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải chi tiết thiết bị…</span></div>
            ) : device ? (
                <>
                    <div className="tab-row" role="tablist">{tabs.map(tab => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{TAB_ICONS[tab]}{tab}</button>)}</div>

                    {/* 4 the tom tat thay cho hang chip cu. Bo Poll interval / Kien truc /
                        API transport / Mgmt endpoint ref -- la tham so ky thuat noi bo, thuoc
                        tab "Ket noi & cau hinh" chu khong phai thu nhin dau tien moi lan mo. */}
                    <div className="mini-stat-row" style={{ marginTop: '0.9rem' }}>
                        <MiniStat
                            label="Trạng thái"
                            value={device.status ?? 'UNKNOWN'}
                            status={statusOf(device.status)}
                            icon={<Activity size={13} />}
                        />
                        <MiniStat
                            label="Model"
                            value={device.model || 'Chưa có dữ liệu'}
                            hint={device.serial ? `SN: ${device.serial}` : undefined}
                            icon={<Server size={13} />}
                        />
                        <MiniStat
                            label="RouterOS"
                            value={device.routeros_version || 'Chưa có dữ liệu'}
                            hint={device.architecture || undefined}
                            icon={<Cpu size={13} />}
                        />
                        <MiniStat
                            label="Lần thấy gần nhất"
                            value={formatLastSeen(device.last_seen_at).text}
                            hint={device.last_seen_at ? formatLastSeen(device.last_seen_at).title : undefined}
                            icon={<Clock size={13} />}
                        />
                    </div>

                    {activeTab === 'Traffic' && (
                        <section className="glass-panel dashboard-section">
                            <div className="section-heading">
                                <div><h2>Lưu lượng đã dùng</h2></div>
                                <div className="tab-row" role="tablist">
                                    {RANGE_OPTIONS.map(opt => <button key={opt.key} type="button" role="tab" aria-selected={range === opt.key} className={range === opt.key ? 'active' : ''} onClick={() => setRange(opt.key)}>{opt.label}</button>)}
                                </div>
                            </div>

                            {trafficError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được traffic" description={trafficError} onRetry={() => void fetchTraffic()} />}
                            {!trafficError && traffic && <DataStateNotice dataStatus={traffic.data_status} title={traffic.data_status === 'AVAILABLE' ? 'Có dữ liệu traffic thật' : 'Chưa có dữ liệu traffic'} description={traffic.data_status === 'AVAILABLE' ? undefined : 'Chưa có interface_counter_deltas nào cho thiết bị này trong khoảng thời gian đã chọn — cần collector SNMP/API poll interface thật.'} onRetry={() => void fetchTraffic()} />}

                            {trafficLoading && !traffic ? (
                                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải traffic…</span></div>
                            ) : (
                                <>
                                    <div className="mini-stat-row">
                                        <MiniStat icon={<Database size={13} />} label="Tổng đã dùng" value={wanTotal.value} unit={wanTotal.unit} hint={rangeOption.label} status={wanStatus} />
                                        <MiniStat icon={<ArrowDown size={13} />} label="Tải xuống" value={wanDownload.value} unit={wanDownload.unit} hint={rangeOption.label} status={wanStatus} />
                                        <MiniStat icon={<ArrowUp size={13} />} label="Tải lên" value={wanUpload.value} unit={wanUpload.unit} hint={rangeOption.label} status={wanStatus} />
                                        <MiniStat icon={<Users size={13} />} label="User hotspot" value={crewUsers.length} unit="user" hint={`${crewActiveCount} đang hoạt động`} status={crewUsers.length > 0 ? 'healthy' : 'unknown'} />
                                    </div>

                                    <VolumeSpeedChart points={wanVolumePoints} granularity={traffic?.period?.granularity ?? rangeOption.granularity} compactTimeLabel={range === '5m' || range === '1d'} />

                                    {/* TAM BO theo yeu cau: khoi "Doi soat du lieu (kiem dem sai lech)".
                                        Khi can dung lai: 3 the Tong WAN / Tong da gan / Sai lech, lay tu
                                        traffic.reconciliation.counted va traffic.reconciliation.gap. */}

                                    <div className="section-heading" style={{ marginTop: '1.6rem' }}>
                                        <div><h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Users size={18} style={{ opacity: 0.75 }} />User hotspot (RADIUS)</h2></div>
                                        <span className="muted-text">{crewSorted.length} user · {crewTotal.value} {crewTotal.unit} · {rangeOption.label}</span>
                                    </div>

                                    {crewError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được user hotspot" description={crewError} onRetry={() => void fetchCrew()} />}

                                    {crewLoading && crewSorted.length === 0 ? (
                                        <div className="loading-block"><div className="loading-spinner" /><span>Đang tải user hotspot…</span></div>
                                    ) : crewSorted.length === 0 ? (
                                        <div className="empty-state">{device.ship_id ? 'Chưa có phiên RADIUS nào của user gán vào thiết bị này trong khoảng thời gian đã chọn.' : 'Thiết bị chưa gán vào tàu nào nên không tra được RADIUS accounting (dữ liệu CREW là cấp tàu).'}</div>
                                    ) : (
                                        <div className="table-shell" style={{ marginTop: 12 }}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>User</th>
                                                        <th>Trạng thái</th>
                                                        <th>Gói cước</th>
                                                        <th style={{ textAlign: 'right' }}>Lượt truy cập</th>
                                                        <th style={{ textAlign: 'right' }}>Tải xuống</th>
                                                        <th style={{ textAlign: 'right' }}>Tải lên</th>
                                                        <th style={{ minWidth: 180 }}>Tổng đã dùng</th>
                                                        <th>Hoạt động gần nhất</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {crewSorted.map(user => {
                                                        const down = formatBytes(user.download_bytes);
                                                        const up = formatBytes(user.upload_bytes);
                                                        const total = formatBytes(user.total_bytes);
                                                        const seen = formatLastSeen(user.last_seen_at);
                                                        return (
                                                            <tr key={user.username}>
                                                                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><User size={14} style={{ opacity: 0.7 }} /><strong>{user.username}</strong></span></td>
                                                                <td>
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                                        {user.status === 'ACTIVE' ? <CircleCheck size={14} color="var(--success)" /> : user.status === 'STALE' ? <CirclePause size={14} color="var(--warning)" /> : <CircleX size={14} color="var(--muted-text)" />}
                                                                        {user.status ?? 'UNKNOWN'}
                                                                    </span>
                                                                </td>
                                                                <td>{user.package?.name ?? <span className="muted-text">Không có</span>}</td>
                                                                <td style={{ textAlign: 'right' }}>{user.access_count ?? user.sessions_count ?? 0}</td>
                                                                <td style={{ textAlign: 'right' }}>{down.value} {down.unit}</td>
                                                                <td style={{ textAlign: 'right' }}>{up.value} {up.unit}</td>
                                                                <td>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(20, 108, 168, 0.12)', overflow: 'hidden' }}>
                                                                            <div style={{ width: `${crewBarPct(user.total_bytes)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #146ca8 0%, #38bdf8 100%)' }} />
                                                                        </div>
                                                                        <span style={{ minWidth: 76, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{total.value} {total.unit}</span>
                                                                    </div>
                                                                </td>
                                                                <td><span className={seen.muted ? 'muted-text' : undefined} title={seen.title}>{seen.text}</span></td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </>
                            )}
                        </section>
                    )}

                    {activeTab === 'Interface' && (
                        <section className="glass-panel dashboard-section">
                            <div className="section-heading">
                                <div><h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Gauge size={18} style={{ opacity: 0.75 }} />Bandwidth theo từng interface</h2></div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <div className="tab-row" role="tablist">
                                        {RANGE_OPTIONS.map(opt => <button key={opt.key} type="button" role="tab" aria-selected={range === opt.key} className={range === opt.key ? 'active' : ''} onClick={() => setRange(opt.key)}>{opt.label}</button>)}
                                    </div>
                                    <div className="tab-row" role="tablist">
                                        <button type="button" role="tab" aria-selected={ifaceViewMode === 'chart'} className={ifaceViewMode === 'chart' ? 'active' : ''} onClick={() => setIfaceViewMode('chart')}>Biểu đồ</button>
                                        <button type="button" role="tab" aria-selected={ifaceViewMode === 'table'} className={ifaceViewMode === 'table' ? 'active' : ''} onClick={() => setIfaceViewMode('table')}>Bảng</button>
                                    </div>
                                </div>
                            </div>

                            {interfaceTrafficError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được bandwidth theo interface" description={interfaceTrafficError} onRetry={() => void fetchInterfaceTraffic()} />}
                            {!interfaceTrafficError && interfaceTraffic && <DataStateNotice dataStatus={interfaceTraffic.data_status} title={interfaceTraffic.data_status === 'AVAILABLE' ? 'Có dữ liệu bandwidth thật' : 'Chưa có dữ liệu'} description={interfaceTraffic.data_status === 'AVAILABLE' ? undefined : 'Chưa có interface_counter_deltas nào trong khoảng thời gian đã chọn.'} onRetry={() => void fetchInterfaceTraffic()} />}

                            {interfaceTrafficLoading && !interfaceTraffic ? (
                                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải bandwidth…</span></div>
                            ) : interfaceChartData.length > 0 && ifaceViewMode === 'chart' ? (
                                <div style={{ width: '100%', height: 280, marginTop: 16 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={interfaceChartData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="time" fontSize={11} />
                                            <YAxis fontSize={11} unit=" Mbps" />
                                            <Tooltip formatter={(v) => `${Number(v).toFixed(3)} Mbps`} />
                                            <Legend />
                                            {(interfaceTraffic?.interfaces ?? []).map((iface, i) => (
                                                <Line key={iface.interface_id ?? iface.name} type="monotone" dataKey={iface.name ?? iface.interface_id ?? '?'} name={iface.name ?? undefined} stroke={IFACE_CHART_COLORS[i % IFACE_CHART_COLORS.length]} dot={false} strokeWidth={1.5} />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : interfaceChartData.length > 0 && ifaceViewMode === 'table' && (
                                <div className="table-shell" style={{ marginTop: 16 }}>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Thời gian</th>
                                                {(interfaceTraffic?.interfaces ?? []).map((iface, i) => (
                                                    <th key={iface.interface_id ?? iface.name}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: IFACE_CHART_COLORS[i % IFACE_CHART_COLORS.length], marginRight: 6 }} />{iface.name}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...interfaceChartData].reverse().map((row, rowIdx) => (
                                                <tr key={rowIdx}>
                                                    <td><strong>{row.time}</strong></td>
                                                    {(interfaceTraffic?.interfaces ?? []).map(iface => {
                                                        const key = iface.name ?? iface.interface_id ?? '?';
                                                        const value = row[key];
                                                        return <td key={key}>{typeof value === 'number' ? `${value.toFixed(3)} Mbps` : '—'}</td>;
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="section-heading" style={{ marginTop: 24 }}>
                                <div>
                                    <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Server size={18} style={{ opacity: 0.75 }} />Toàn bộ dữ liệu nhận được từ MikroTik</h2>
                                    <p>Nguyên văn payload mỗi lần push — counter cộng dồn từ lúc router boot (không phải delta), packets/errors/drops chỉ khác "—" khi router thật sự gửi trường đó.</p>
                                </div>
                                <span>{interfaces.length} interface</span>
                            </div>
                            {interfaceTraffic?.last_push && (
                                <div className="dashboard-meta" style={{ marginTop: 0, marginBottom: '0.8rem' }}>
                                    <span><strong>Router tự báo (identity):</strong> {interfaceTraffic.last_push.identity ?? 'Không gửi'}</span>
                                    <span><strong>Lần push gần nhất:</strong> {interfaceTraffic.last_push.received_at ? new Date(interfaceTraffic.last_push.received_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
                                </div>
                            )}
                            <div className="table-shell">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Interface</th><th>Loại</th><th>Nhóm đối soát</th><th>Trạng thái</th><th>Tốc độ danh định</th>
                                            <th><ArrowDown size={12} style={{ verticalAlign: -1 }} /> RX bytes (cộng dồn)</th><th><ArrowUp size={12} style={{ verticalAlign: -1 }} /> TX bytes (cộng dồn)</th><th>RX packets</th><th>TX packets</th><th>RX errors</th><th>TX errors</th><th>RX drops</th><th>TX drops</th>
                                            <th>Lần đọc gần nhất</th><th>Data tháng này</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {interfaces.map(iface => {
                                            const detail = iface.id ? monthTotalByIfaceId.get(iface.id) : undefined;
                                            const totalFmt = formatBytes(detail?.total ?? null);
                                            const latest = detail?.latest;
                                            const n = (v: number | null | undefined) => v != null ? v.toLocaleString('vi-VN') : '—';
                                            return (
                                                <tr key={iface.id}>
                                                    <td><strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{ifaceTypeIcon(iface.type)}{iface.name}</strong></td>
                                                    <td>{iface.type ?? 'Không rõ'}</td>
                                                    <td>{iface.accounting_group ?? 'NONE'}</td>
                                                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><StatusIcon state={iface.oper_state} />{iface.admin_state ?? 'UNKNOWN'} / {iface.oper_state ?? 'UNKNOWN'}</span></td>
                                                    <td>{formatRate(iface.speed_bps).value} {formatRate(iface.speed_bps).unit}</td>
                                                    <td>{latest ? `${formatBytes(latest.rx_bytes).value} ${formatBytes(latest.rx_bytes).unit}` : 'Chưa có dữ liệu'}</td>
                                                    <td>{latest ? `${formatBytes(latest.tx_bytes).value} ${formatBytes(latest.tx_bytes).unit}` : 'Chưa có dữ liệu'}</td>
                                                    <td>{n(latest?.rx_packets)}</td>
                                                    <td>{n(latest?.tx_packets)}</td>
                                                    <td>{n(latest?.rx_errors)}</td>
                                                    <td>{n(latest?.tx_errors)}</td>
                                                    <td>{n(latest?.rx_drops)}</td>
                                                    <td>{n(latest?.tx_drops)}</td>
                                                    <td>{latest?.observed_at ? new Date(latest.observed_at).toLocaleString('vi-VN') : 'Chưa có dữ liệu'}</td>
                                                    <td>{detail?.total != null ? `${totalFmt.value} ${totalFmt.unit}` : 'Chưa có dữ liệu'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {interfaces.length === 0 && <div className="empty-state">Chưa có interface nào được khai báo cho thiết bị này.</div>}
                        </section>
                    )}

                    {activeTab === 'Người dùng' && (
                        <section className="glass-panel dashboard-section">
                            <div className="section-heading"><div><h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Users size={18} style={{ opacity: 0.75 }} />Người dùng gán vào thiết bị này</h2></div><span>{subscribers.length} user</span></div>

                            {usersError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách user" description={usersError} onRetry={() => void fetchUsers()} />}

                            {usersLoading && subscribers.length === 0 ? (
                                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải user…</span></div>
                            ) : (
                                <>
                                    <div className="grid-cards">
                                        <MetricCard icon={<Users size={15} />} title="Tổng user" value={subscribers.length} unit="user" period="Hiện tại" source="subscribers.nas_device_id" freshness="Trực tiếp từ DB" status="healthy" />
                                        <MetricCard icon={<UserCheck size={15} />} title="User đang hoạt động" value={activeUserCount} unit="user" period="Hiện tại" source="subscribers.status" freshness="Trực tiếp từ DB" status="healthy" />
                                        <MetricCard icon={<Database size={15} />} title="Tổng data đã dùng" value={formatBytes(totalUserQuota).value} unit={formatBytes(totalUserQuota).unit} period="Cộng dồn" source="subscribers.quota_used_bytes" freshness="Trực tiếp từ DB" status="healthy" />
                                    </div>
                                    <div className="table-shell" style={{ marginTop: 12 }}>
                                        <table className="data-table">
                                            <thead><tr><th>Username</th><th>Gói cước</th><th>Data đã dùng</th><th>Hết hạn</th><th>Trạng thái</th></tr></thead>
                                            <tbody>
                                                {subscribers.map(sub => (
                                                    <tr key={sub.id}>
                                                        <td><Link to={`/users/${sub.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><User size={14} style={{ opacity: 0.7 }} /><strong>{sub.username}</strong></Link></td>
                                                        <td>{packageName(sub.package_id)}</td>
                                                        <td>{formatBytes(sub.quota_used_bytes).value} {formatBytes(sub.quota_used_bytes).unit}</td>
                                                        <td>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('vi-VN') : 'Không rõ'}</td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                                {sub.status === 'ACTIVE' ? <CircleCheck size={14} color="var(--success)" /> : sub.status === 'SUSPENDED' ? <CirclePause size={14} color="var(--warning)" /> : <CircleX size={14} color="var(--danger)" />}
                                                                {sub.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {subscribers.length === 0 && !usersLoading && <div className="empty-state">Chưa có user nào được gán vào thiết bị này làm NAS.</div>}
                                    <div className="empty-state" style={{ textAlign: 'left', background: '#eff6ff', border: '1px solid #bfdbfe', flexDirection: 'column' }}>
                                        <strong>Phân loại theo dịch vụ (YouTube/TikTok/...) đã có dữ liệu thật</strong>
                                        <p style={{ marginTop: 4, marginBottom: 8 }}>Bảng ở trên là subscriber Hotspot (gói cước, quota) — riêng biệt với RADIUS/CREW. Byte thật theo từng dịch vụ (NetFlow v9 + DNS log, xem <code>ipfix_flow_records.classification_method</code>) hiển thị ở tab <strong>CREW</strong> trên trang <strong>Tàu</strong> (theo cả tàu, không phải theo 1 thiết bị), vì RADIUS accounting là dữ liệu cấp tàu.</p>
                                        {device.ship_id && <Link to={`/ships?ship=${device.ship_id}`} className="button-secondary compact-button" style={{ display: 'inline-block', textDecoration: 'none' }}>Mở tab CREW của tàu này →</Link>}
                                    </div>
                                </>
                            )}
                        </section>
                    )}

                    {activeTab === 'Kết nối trực tiếp' && (
                        <section className="glass-panel dashboard-section">
                            <div className="section-heading">
                                <div><h2>Kết nối &amp; cấu hình (push 1 chiều)</h2><p>Router tự đẩy telemetry lên server mỗi 5 phút qua RouterOS scheduler — server không bao giờ chủ động kết nối vào router, nên không cần lưu mật khẩu admin thật.</p></div>
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: 'block' }}>
                                    <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>IP quản trị của router (inventory, không phải secret)</span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input type="text" value={ipInput} placeholder="vd: 192.168.88.1" onChange={e => setIpInput(e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                        <button type="button" className="filter-apply" disabled={ipSaving || ipInput.trim() === (device.ip_address ?? '')} onClick={() => void saveIpAddress()}>{ipSaving ? 'Đang lưu…' : 'Lưu IP'}</button>
                                    </div>
                                    {ipSaveError && <span style={{ color: '#dc2626', fontSize: 12 }}>{ipSaveError}</span>}
                                    {!ipSaveError && ipSavedAt && <span style={{ color: '#16a34a', fontSize: 12 }}>Đã lưu.</span>}
                                </label>
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>Push API key — do admin tự đặt (không còn tự sinh ngẫu nhiên)</span>
                                {device.push_key_configured ? (
                                    <p>Đã cấu hình — đặt lúc {device.push_key_issued_at ? new Date(device.push_key_issued_at).toLocaleString('vi-VN') : 'không rõ'}. Server chỉ giữ bản băm (sha256), không lưu key thật.</p>
                                ) : (
                                    <p className="muted-text">Chưa đặt push API key cho thiết bị này — router sẽ nhận DEVICE_PUSH_NOT_CONFIGURED (409) nếu gửi telemetry lúc này.</p>
                                )}
                                <div className="settings-field" style={{ margin: '10px 0 6px', maxWidth: 320 }}>
                                    <label>{device.push_key_configured ? 'Đặt lại API key' : 'Đặt API key'}</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className="filter-select" type="text" minLength={8} value={newPushKeyInput} onChange={e => setNewPushKeyInput(e.target.value)} placeholder="Tối thiểu 8 ký tự" style={{ fontFamily: 'var(--font-mono)' }} />
                                        <button type="button" className="button-secondary compact-button" title="Tự sinh giá trị ngẫu nhiên" onClick={() => setNewPushKeyInput(generateRandomHex(32))}><Shuffle size={14} /></button>
                                    </div>
                                </div>
                                {keyError && <p style={{ color: '#dc2626', fontSize: 12 }}>{keyError}</p>}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button type="button" className="filter-apply" disabled={keyBusy || newPushKeyInput.length < 8} onClick={() => void setPushKey()}>{keyBusy ? 'Đang lưu…' : 'Lưu API key'}</button>
                                    {device.push_key_configured && <button type="button" className="button-secondary compact-button" disabled={keyBusy} onClick={() => void revokeKey()}>Thu hồi key</button>}
                                    {keySaved && <span className="muted-text" style={{ color: 'var(--success)' }}>Đã lưu ✓</span>}
                                </div>
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>Shared secret RADIUS — dùng để xác thực Accounting-Request/Access-Request thật từ router này</span>
                                {device.radius_secret_configured ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        {revealedSecret ? (
                                            <>
                                                <code style={{ background: 'rgba(20, 108, 168, 0.08)', padding: '4px 9px', borderRadius: 6, fontSize: 13, wordBreak: 'break-all' }}>{revealedSecret}</code>
                                                <button type="button" className="button-secondary compact-button" onClick={() => void copyText(revealedSecret, 'radius-secret')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{copyFeedback === 'radius-secret' ? <Check size={13} /> : <Copy size={13} />}{copyFeedback === 'radius-secret' ? 'Đã chép' : 'Sao chép'}</button>
                                                <button type="button" className="button-secondary compact-button" onClick={() => setRevealedSecret(undefined)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><EyeOff size={13} />Ẩn</button>
                                            </>
                                        ) : (
                                            <>
                                                <span className="status-dot healthy">Đã cấu hình</span>
                                                <button type="button" className="button-secondary compact-button" disabled={revealBusy} onClick={() => void revealRadiusSecret()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Eye size={13} />{revealBusy ? 'Đang lấy…' : 'Hiện secret'}</button>
                                            </>
                                        )}
                                        <span className="muted-text" style={{ fontSize: 12 }}>Đặt lúc {device.radius_secret_issued_at ? new Date(device.radius_secret_issued_at).toLocaleString('vi-VN') : 'không rõ'}</span>
                                    </div>
                                ) : (
                                    <p className="muted-text">Chưa đặt secret RADIUS cho thiết bị này — mọi gói Accounting-Request/Access-Request thật từ router sẽ bị server âm thầm bỏ qua.</p>
                                )}
                                {revealError && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{revealError}</p>}
                                {revealedSecret && <p className="muted-text" style={{ fontSize: 12, marginTop: 6 }}>Mỗi lần hiện secret đều được ghi vào nhật ký kiểm toán (<code>device.radius_secret_reveal</code>).</p>}
                                <div className="settings-field" style={{ margin: '10px 0 6px', maxWidth: 320 }}>
                                    <label>{device.radius_secret_configured ? 'Đặt lại secret' : 'Đặt secret RADIUS'}</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className="filter-select" type="text" minLength={4} value={newRadiusSecretInput} onChange={e => setNewRadiusSecretInput(e.target.value)} placeholder="Tối thiểu 4 ký tự" style={{ fontFamily: 'var(--font-mono)' }} />
                                        <button type="button" className="button-secondary compact-button" title="Tự sinh giá trị ngẫu nhiên" onClick={() => setNewRadiusSecretInput(generateRandomHex(24))}><Shuffle size={14} /></button>
                                    </div>
                                </div>
                                {radiusSecretError && <p style={{ color: '#dc2626', fontSize: 12 }}>{radiusSecretError}</p>}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button type="button" className="filter-apply" disabled={radiusSecretBusy || newRadiusSecretInput.length < 4} onClick={() => void setRadiusSecretValue()}>{radiusSecretBusy ? 'Đang lưu…' : 'Lưu secret'}</button>
                                    {device.radius_secret_configured && <button type="button" className="button-secondary compact-button" disabled={radiusSecretBusy} onClick={() => void revokeRadiusSecret()}>Thu hồi secret</button>}
                                    {radiusSecretSaved && <span className="muted-text" style={{ color: 'var(--success)' }}>Đã lưu ✓</span>}
                                </div>
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>Server URL cho telemetry push (nhìn từ phía router — sửa lại nếu router phải đi qua domain/IP công khai khác)</span>
                                <input type="text" value={serverUrl} onChange={e => setServerUrl(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: 12 }} />
                            </div>

                            {/* MOT cua so duy nhat cho toan bo cau hinh router. Truoc day cho nay co 3 o rieng
                                (RADIUS / push telemetry / NetFlow+DNS), moi o mot nut sao chep va mot noi dan
                                khac nhau -- Terminal cho 2 cai, Scheduler cho cai con lai. Dan thieu 1 manh la
                                du lieu khong len ma khong co loi nao bao. */}
                            <div style={{ borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: 20 }}>
                                <div className="section-heading">
                                    <div>
                                        <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Terminal size={18} style={{ opacity: 0.75 }} />Lệnh cấu hình MikroTik</h2>
                                        <p>Toàn bộ cấu hình cho thiết bị này trong một khối: RADIUS, NetFlow v9, DNS log và script đẩy counter mỗi 5 phút. Dán một lần vào Terminal của router — không cần mở Scheduler.</p>
                                    </div>
                                    <button type="button" className="filter-apply" onClick={() => void copyText(fullConfigText, 'full-config')}>{copyFeedback === 'full-config' ? 'Đã chép ✓' : 'Sao chép toàn bộ'}</button>
                                </div>

                                {fullConfigBlockers.length > 0 && (
                                    <div className="empty-state" style={{ textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d', marginBottom: 12 }}>
                                        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TriangleAlert size={15} color="var(--warning)" />Lệnh còn chỗ trống</strong>
                                        <p style={{ marginTop: 4, marginBottom: 0 }}>Còn thiếu: {fullConfigBlockers.join('; ')}. Dán lúc này router sẽ báo lỗi cú pháp ở đúng chỗ còn dấu ngoặc nhọn.</p>
                                    </div>
                                )}

                                <pre style={{ background: '#0d3352', color: '#e2f1fb', padding: '14px 16px', borderRadius: 10, overflowX: 'auto', maxHeight: 460, fontSize: 12, lineHeight: 1.6, margin: 0 }}>{fullConfigText}</pre>

                                <p className="muted-text" style={{ fontSize: 12, marginTop: 8 }}>NetFlow, DNS log và RADIUS đều gửi UDP tới <code>{radiusSettings?.radius_server_address ?? 'địa chỉ chưa đặt'}</code> (Cài đặt → RADIUS) vì cả ba cổng do cùng một tiến trình backend lắng nghe; riêng telemetry push đi bằng HTTP tới Server URL ở trên, nên hai địa chỉ có thể khác nhau nếu router phải qua reverse proxy. Sau khi dán, số liệu theo dịch vụ xem ở tab CREW/BUSINESS trên trang Tàu — dữ liệu đó là cấp tàu, không phải cấp thiết bị.</p>
                            </div>

                            <div className="dashboard-meta" style={{ marginTop: 16 }}>
                                <span><strong>Lần nhận dữ liệu gần nhất:</strong> {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('vi-VN') : 'Chưa nhận được push nào'}</span>
                            </div>
                        </section>
                    )}
                </>
            ) : (
                <div className="empty-state">Không tìm thấy thiết bị.</div>
            )}
        </div>
    );
};
