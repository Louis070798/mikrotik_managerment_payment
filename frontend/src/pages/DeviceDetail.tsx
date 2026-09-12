import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { InterfacesService, InventoryService, PackagesService, SubscribersService } from '../api';
import type { Device } from '../api/models/Device';
import type { Interface as ShipInterface } from '../api/models/Interface';
import type { DeviceTraffic } from '../api/models/DeviceTraffic';
import type { DeviceInterfaceTraffic } from '../api/models/DeviceInterfaceTraffic';
import type { Subscriber } from '../api/models/Subscriber';
import type { Package } from '../api/models/Package';
import { DataStateNotice } from '../components/DataStateNotice';
import { MetricCard } from '../components/MetricCard';
import { MiniStat } from '../components/MiniStat';
import { SecretReveal } from '../components/SecretReveal';
import { VolumeSpeedChart } from '../components/VolumeSpeedChart';
import { bytesToRateBps, combineBytes, combineGapBytes, formatBytes, formatPercent, formatRate, getApiErrorInfo, type DashboardGranularity } from '../lib/dashboard';

type TrafficRange = '5m' | '1d' | '3d' | '7d';
type Tab = 'Traffic' | 'Interface' | 'Người dùng' | 'Kết nối trực tiếp';

const RANGE_OPTIONS: { key: TrafficRange; label: string; ms: number; granularity: DashboardGranularity }[] = [
    { key: '5m', label: '5 phút', ms: 5 * 60 * 1000, granularity: '1m' },
    { key: '1d', label: '1 ngày', ms: 24 * 60 * 60 * 1000, granularity: '5m' },
    { key: '3d', label: '3 ngày', ms: 3 * 24 * 60 * 60 * 1000, granularity: '1h' },
    { key: '7d', label: '7 ngày', ms: 7 * 24 * 60 * 60 * 1000, granularity: '1h' },
];
const tabs: Tab[] = ['Traffic', 'Interface', 'Người dùng', 'Kết nối trực tiếp'];

/**
 * Sinh script RouterOS thật để dán vào System > Scheduler — model push 1 chiều (xem
 * migrations/control/0007, DEVICE_PUSH_* trong errors.ts). Router tự đọc rx-byte/tx-byte từng
 * interface, tự ghép JSON (RouterOS không có serializer sẵn) rồi POST bằng /tool fetch mỗi 5 phút.
 * Server không bao giờ chủ động kết nối ngược vào router.
 */
function buildRouterOsScript(deviceId: string, apiKey: string, serverUrl: string): string {
    const pushUrl = `${serverUrl.replace(/\/+$/, '')}/devices/${deviceId}/telemetry-push`;
    const lines = [
        `# === Fleet push telemetry — device_id=${deviceId} ===`,
        '# Dan toan bo script nay vao System > Scheduler > (+) > On Event, dat Interval = 00:05:00.',
        '# Router tu chay moi 5 phut va tu gui counter len server (push 1 chieu) — server KHONG bao gio ket noi nguoc vao router.',
        `:local serverUrl "${pushUrl}"`,
        `:local apiKey "${apiKey}"`,
        ':local ident [/system identity get name]',
        '',
        ':local json ("{\\"identity\\":\\"" . $ident . "\\",\\"interfaces\\":[")',
        ':local first true',
        ':foreach i in=[/interface find where disabled=no] do={',
        '    :local ifName [/interface get $i name]',
        '    :local rx [/interface get $i rx-byte]',
        '    :local tx [/interface get $i tx-byte]',
        '    :if ($first = false) do={ :set json ($json . ",") }',
        '    :set json ($json . "{\\"name\\":\\"" . $ifName . "\\",\\"rx_byte\\":" . $rx . ",\\"tx_byte\\":" . $tx . "}")',
        '    :set first false',
        '}',
        ':set json ($json . "]}")',
        '',
        '/tool fetch url=$serverUrl http-method=post output=none \\',
        '    http-header-field="Content-Type: application/json,X-Device-Api-Key: $apiKey" \\',
        '    http-data=$json',
    ];
    return lines.join('\n');
}

/**
 * Lấy phần host thuần (không protocol, không path, không cổng) từ Server URL đã có sẵn ở tab này
 * (người dùng đã tự điền cho script push telemetry) — tái dùng đúng địa chỉ đó cho NetFlow/DNS log
 * thay vì bắt điền lại hoặc để placeholder <SERVER_IP> mơ hồ, vì đây chính là địa chỉ router đã
 * chứng minh tới được.
 */
function extractHost(serverUrl: string): string {
    try {
        return new URL(serverUrl).hostname;
    } catch {
        return serverUrl.replace(/^https?:\/\//, '').split(/[/:]/)[0] || '<SERVER_IP>';
    }
}

/**
 * Cấu hình NetFlow v9 + DNS log thật (RFC 3954 / RouterOS `/system logging topics=dns`) — CHỈ
 * THÊM vào router, không đổi bất kỳ dòng cấu hình nào khác (đúng yêu cầu người dùng cho Hai Nam
 * 81). Dán trực tiếp vào Terminal, không phải Scheduler (đây là cấu hình router thường trực, không
 * phải script chạy định kỳ). Server lắng nghe UDP 2055 (NetFlow) và UDP 5514 (DNS log) — xem
 * backend/src/libs/netflow-collector, dns-log-collector.
 */
function buildNetflowDnsScript(host: string): string {
    return [
        '# === NetFlow v9 + DNS log — phan tich WAN dung bao nhieu cho dich vu nao (YouTube/TikTok/...) ===',
        '# Dan vao Terminal (khong phai Scheduler) -- day la cau hinh thuong truc, chi THEM, khong doi gi khac.',
        '/ip traffic-flow',
        'set active-flow-timeout=1m cache-entries=32k enabled=yes inactive-flow-timeout=2m interfaces=CREW,BUSINESS',
        '/ip traffic-flow target',
        `add dst-address=${host} port=2055 version=9`,
        '/system logging action',
        // Ten action RouterOS chi cho phep chu+so (khong dau gach ngang) -- "remote-dns" bi tu choi
        // that ("action name can contain only letters and numbers"), dung "remotedns".
        `add name=remotedns remote=${host} remote-port=5514 target=remote`,
        '/system logging',
        'add action=remotedns topics=dns',
    ].join('\n');
}

function statusOf(state?: string): 'healthy' | 'warning' | 'critical' | 'unknown' {
    if (state === 'ONLINE' || state === 'UP') return 'healthy';
    if (state === 'DEGRADED') return 'warning';
    if (state === 'OFFLINE' || state === 'DOWN') return 'critical';
    return 'unknown';
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
    const [issuedKey, setIssuedKey] = useState<string>();
    const [keyBusy, setKeyBusy] = useState(false);
    const [keyError, setKeyError] = useState('');
    const [issuedRadiusSecret, setIssuedRadiusSecret] = useState<string>();
    const [radiusSecretBusy, setRadiusSecretBusy] = useState(false);
    const [radiusSecretError, setRadiusSecretError] = useState('');
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

    const issueKey = useCallback(async () => {
        if (!deviceId) return;
        setKeyBusy(true);
        setKeyError('');
        try {
            const res = await InventoryService.postDevicesPushKey({ deviceId });
            setIssuedKey(res.data?.api_key);
            const fresh = await InventoryService.getDevices1({ deviceId });
            setDevice(fresh.data);
        } catch (requestError) {
            setKeyError(getApiErrorInfo(requestError).message);
        } finally {
            setKeyBusy(false);
        }
    }, [deviceId]);

    const revokeKey = useCallback(async () => {
        if (!deviceId) return;
        setKeyBusy(true);
        setKeyError('');
        try {
            await InventoryService.deleteDevicesPushKey({ deviceId });
            setIssuedKey(undefined);
            const fresh = await InventoryService.getDevices1({ deviceId });
            setDevice(fresh.data);
        } catch (requestError) {
            setKeyError(getApiErrorInfo(requestError).message);
        } finally {
            setKeyBusy(false);
        }
    }, [deviceId]);

    const issueRadiusSecret = useCallback(async () => {
        if (!deviceId) return;
        setRadiusSecretBusy(true);
        setRadiusSecretError('');
        try {
            const res = await InventoryService.postDevicesRadiusSecret({ deviceId });
            setIssuedRadiusSecret(res.data?.secret);
            const fresh = await InventoryService.getDevices1({ deviceId });
            setDevice(fresh.data);
        } catch (requestError) {
            setRadiusSecretError(getApiErrorInfo(requestError).message);
        } finally {
            setRadiusSecretBusy(false);
        }
    }, [deviceId]);

    const revokeRadiusSecret = useCallback(async () => {
        if (!deviceId) return;
        setRadiusSecretBusy(true);
        setRadiusSecretError('');
        try {
            await InventoryService.deleteDevicesRadiusSecret({ deviceId });
            setIssuedRadiusSecret(undefined);
            const fresh = await InventoryService.getDevices1({ deviceId });
            setDevice(fresh.data);
        } catch (requestError) {
            setRadiusSecretError(getApiErrorInfo(requestError).message);
        } finally {
            setRadiusSecretBusy(false);
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

    // .wan.download_bytes/.upload_bytes moi bucket -- dung nguyen cho VolumeSpeedChart (component
    // dung chung, tu tinh ca bieu do cot khoi luong lan bieu do line toc do tu points tho nay).
    const wanVolumePoints = useMemo(
        () => (traffic?.points ?? []).map(point => ({ bucket: point.bucket, download_bytes: point.wan?.download_bytes, upload_bytes: point.wan?.upload_bytes })),
        [traffic],
    );

    const IFACE_CHART_COLORS = ['#009688', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#84cc16', '#6366f1', '#f97316', '#06b6d4', '#a855f7'];

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

    const routerOsScript = useMemo(
        () => (deviceId ? buildRouterOsScript(deviceId, issuedKey ?? '<DÁN_API_KEY_VỪA_TẠO_VÀO_ĐÂY>', serverUrl) : ''),
        [deviceId, issuedKey, serverUrl],
    );
    const netflowDnsScript = useMemo(() => buildNetflowDnsScript(extractHost(serverUrl)), [serverUrl]);

    const packageName = (id?: string | null) => packages.find(p => p.id === id)?.name ?? 'Không rõ';
    const totalUserQuota = subscribers.reduce((sum, s) => sum + (s.quota_used_bytes ?? 0), 0);
    const activeUserCount = subscribers.filter(s => s.status === 'ACTIVE').length;

    // Gop download+upload thanh 1 con so "tong data" -- trang nay khong can phan biet chieu, chi
    // trang chi tiet ship (tab WAN & Reconciliation) moi can tach rieng tung chieu de dien doan.
    const wanTotal = formatBytes(combineBytes(traffic?.wan?.download_bytes, traffic?.wan?.upload_bytes));
    const countedTotal = formatBytes(combineBytes(traffic?.reconciliation?.counted?.download_bytes, traffic?.reconciliation?.counted?.upload_bytes));
    const gap = combineGapBytes(traffic?.wan?.download_bytes, traffic?.wan?.upload_bytes, traffic?.reconciliation?.gap?.download_bytes, traffic?.reconciliation?.gap?.upload_bytes);
    const gapTotal = formatBytes(gap.bytes);
    const gapStatus: 'unknown' | 'healthy' | 'warning' | 'critical' = gap.pct == null ? 'unknown' : Math.abs(gap.pct) > 15 ? 'critical' : Math.abs(gap.pct) > 5 ? 'warning' : 'healthy';

    return (
        <div>
            <div className="top-bar">
                <div>
                    <Link to="/devices" className="muted-text">← Quay lại danh sách thiết bị</Link>
                    <h1>{device?.name ?? 'Chi tiết thiết bị'}</h1>
                    <p className="page-subtitle">{device?.code} · {device?.role}</p>
                </div>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được thông tin thiết bị" description={error} onRetry={() => void fetchData()} />}

            {loading && !device ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải chi tiết thiết bị…</span></div>
            ) : device ? (
                <>
                    <div className="tab-row" role="tablist">{tabs.map(tab => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>

                    <div className="dashboard-meta" style={{ marginTop: '0.6rem' }}>
                        <span className={`status-dot ${statusOf(device.status)}`}><strong>Trạng thái:</strong>&nbsp;{device.status ?? 'UNKNOWN'}</span>
                        <span><strong>RouterOS:</strong> {device.routeros_version ?? 'Không rõ'}</span>
                        <span><strong>Model:</strong> {device.model ?? 'Không rõ'}{device.serial ? ` (SN: ${device.serial})` : ''}</span>
                        <span><strong>Poll interval:</strong> {device.poll_interval_s ?? '—'}s</span>
                        <span><strong>Kiến trúc:</strong> {device.architecture ?? 'Không rõ'}</span>
                        <span><strong>API transport:</strong> {device.api_transport ?? 'Không rõ'}</span>
                        <span><strong>Lần thấy gần nhất:</strong> {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('vi-VN') : 'Chưa ghi nhận'}</span>
                        <span><strong>Mgmt endpoint ref:</strong> {device.mgmt_endpoint_ref ?? 'Chưa gán'}</span>
                    </div>

                    {activeTab === 'Traffic' && (
                        <section className="glass-panel dashboard-section">
                            <div className="section-heading">
                                <div><h2>Total WAN</h2><p>Tổng lưu lượng và tốc độ WAN, tính từ interface_counter_deltas thật.</p></div>
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
                                        <MiniStat label="Tổng data WAN" value={wanTotal.value} unit={wanTotal.unit} hint={rangeOption.label} status={traffic?.wan?.download_bytes == null && traffic?.wan?.upload_bytes == null ? 'unknown' : 'healthy'} />
                                    </div>

                                    <VolumeSpeedChart points={wanVolumePoints} granularity={traffic?.period?.granularity ?? rangeOption.granularity} compactTimeLabel={range === '5m' || range === '1d'} />

                                    <div className="section-heading" style={{ marginTop: 24 }}>
                                        <div><h2>Đối soát dữ liệu (kiểm đếm sai lệch)</h2><p>So tổng data thật đã lên server qua WAN với tổng đã gán cho CREW/BUSINESS/MANAGEMENT — cùng công thức đối soát cấp tàu, lọc riêng cho thiết bị này.</p></div>
                                    </div>
                                    <div className="mini-stat-row">
                                        <MiniStat label="Tổng WAN (đã lên server)" value={wanTotal.value} unit={wanTotal.unit} hint={rangeOption.label} status={traffic?.wan?.download_bytes == null && traffic?.wan?.upload_bytes == null ? 'unknown' : 'healthy'} />
                                        <MiniStat label="Tổng đã gán (CREW+BUSINESS+MGMT)" value={countedTotal.value} unit={countedTotal.unit} hint={rangeOption.label} status={traffic?.reconciliation?.counted?.download_bytes == null && traffic?.reconciliation?.counted?.upload_bytes == null ? 'unknown' : 'healthy'} />
                                        <MiniStat label="Sai lệch" value={gapTotal.value} unit={gapTotal.unit} hint={gap.pct == null ? 'Chưa có %' : `${formatPercent(gap.pct)} so với tổng WAN`} status={gapStatus} />
                                    </div>
                                    <p className="muted-text" style={{ fontSize: 12, marginTop: 8 }}>Sai lệch dương = còn traffic WAN chưa được gán vào interface CREW/BUSINESS/MANAGEMENT nào (vd interface đang để "NONE"). Không phải lỗi hệ thống — kiểm tra lại tab Interface để gán đúng nhóm đối soát.</p>
                                </>
                            )}
                        </section>
                    )}

                    {activeTab === 'Interface' && (
                        <section className="glass-panel dashboard-section">
                            <div className="section-heading">
                                <div><h2>Bandwidth theo từng interface</h2><p>Mỗi đường/hàng là 1 interface thật (rx+tx gộp), tính từ interface_counter_deltas.</p></div>
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
                                    <h2>Toàn bộ dữ liệu nhận được từ MikroTik</h2>
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
                                            <th>RX bytes (cộng dồn)</th><th>TX bytes (cộng dồn)</th><th>RX packets</th><th>TX packets</th><th>RX errors</th><th>TX errors</th><th>RX drops</th><th>TX drops</th>
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
                                                    <td><strong>{iface.name}</strong></td>
                                                    <td>{iface.type ?? 'Không rõ'}</td>
                                                    <td>{iface.accounting_group ?? 'NONE'}</td>
                                                    <td><span className={`status-dot ${statusOf(iface.oper_state)}`}>{iface.admin_state ?? 'UNKNOWN'} / {iface.oper_state ?? 'UNKNOWN'}</span></td>
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
                            <div className="section-heading"><div><h2>Người dùng gán vào thiết bị này</h2><p>Subscriber PPPoE/Hotspot có NAS = thiết bị này.</p></div><span>{subscribers.length} user</span></div>

                            {usersError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách user" description={usersError} onRetry={() => void fetchUsers()} />}

                            {usersLoading && subscribers.length === 0 ? (
                                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải user…</span></div>
                            ) : (
                                <>
                                    <div className="grid-cards">
                                        <MetricCard title="Tổng user" value={subscribers.length} unit="user" period="Hiện tại" source="subscribers.nas_device_id" freshness="Trực tiếp từ DB" status="healthy" />
                                        <MetricCard title="User đang hoạt động" value={activeUserCount} unit="user" period="Hiện tại" source="subscribers.status" freshness="Trực tiếp từ DB" status="healthy" />
                                        <MetricCard title="Tổng data đã dùng" value={formatBytes(totalUserQuota).value} unit={formatBytes(totalUserQuota).unit} period="Cộng dồn" source="subscribers.quota_used_bytes" freshness="Trực tiếp từ DB" status="healthy" />
                                    </div>
                                    <div className="table-shell" style={{ marginTop: 12 }}>
                                        <table className="data-table">
                                            <thead><tr><th>Username</th><th>Gói cước</th><th>Data đã dùng</th><th>Hết hạn</th><th>Trạng thái</th></tr></thead>
                                            <tbody>
                                                {subscribers.map(sub => (
                                                    <tr key={sub.id}>
                                                        <td><Link to={`/users/${sub.id}`}><strong>{sub.username}</strong></Link></td>
                                                        <td>{packageName(sub.package_id)}</td>
                                                        <td>{formatBytes(sub.quota_used_bytes).value} {formatBytes(sub.quota_used_bytes).unit}</td>
                                                        <td>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('vi-VN') : 'Không rõ'}</td>
                                                        <td><span className={`status-dot ${sub.status === 'ACTIVE' ? 'healthy' : sub.status === 'SUSPENDED' ? 'warning' : 'critical'}`}>{sub.status}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {subscribers.length === 0 && !usersLoading && <div className="empty-state">Chưa có user nào được gán vào thiết bị này làm NAS.</div>}
                                    <div className="empty-state" style={{ textAlign: 'left', background: '#eff6ff', border: '1px solid #bfdbfe', flexDirection: 'column' }}>
                                        <strong>Phân loại theo dịch vụ (YouTube/TikTok/...) đã có dữ liệu thật</strong>
                                        <p style={{ marginTop: 4, marginBottom: 8 }}>Bảng ở trên là subscriber PPPoE/Hotspot (gói cước, quota) — riêng biệt với RADIUS/CREW. Byte thật theo từng dịch vụ (NetFlow v9 + DNS log, xem <code>ipfix_flow_records.classification_method</code>) hiển thị ở tab <strong>CREW</strong> trên trang <strong>Tàu</strong> (theo cả tàu, không phải theo 1 thiết bị), vì RADIUS accounting là dữ liệu cấp tàu.</p>
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
                                <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>Trạng thái push API key</span>
                                {issuedKey ? (
                                    <SecretReveal
                                        heading="Key thật — chỉ hiển thị MỘT LẦN DUY NHẤT, hãy sao chép/dán vào router ngay:"
                                        value={issuedKey}
                                        copied={copyFeedback === 'key'}
                                        onCopy={() => void copyText(issuedKey, 'key')}
                                        caption="Rời khỏi trang này sẽ không xem lại được key — nếu mất, hãy cấp key mới (key cũ sẽ bị vô hiệu)."
                                    />
                                ) : device.push_key_configured ? (
                                    <p>Đã cấu hình — cấp lúc {device.push_key_issued_at ? new Date(device.push_key_issued_at).toLocaleString('vi-VN') : 'không rõ'}. Server chỉ giữ bản băm (sha256), không lưu key thật.</p>
                                ) : (
                                    <p className="muted-text">Chưa cấp push API key cho thiết bị này — router sẽ nhận DEVICE_PUSH_NOT_CONFIGURED (409) nếu gửi telemetry lúc này.</p>
                                )}
                                {keyError && <p style={{ color: '#dc2626', fontSize: 12 }}>{keyError}</p>}
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <button type="button" className="filter-apply" disabled={keyBusy} onClick={() => void issueKey()}>{keyBusy ? 'Đang xử lý…' : device.push_key_configured ? 'Cấp lại API key' : 'Tạo API key'}</button>
                                    {device.push_key_configured && <button type="button" className="button-secondary compact-button" disabled={keyBusy} onClick={() => void revokeKey()}>Thu hồi key</button>}
                                </div>
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>Shared secret RADIUS (dùng để xác thực Accounting-Request/Access-Request thật từ router này)</span>
                                {issuedRadiusSecret ? (
                                    <SecretReveal
                                        heading="Secret thật — chỉ hiển thị MỘT LẦN DUY NHẤT, hãy dán vào RADIUS Client trên router ngay:"
                                        value={issuedRadiusSecret}
                                        copied={copyFeedback === 'radius'}
                                        onCopy={() => void copyText(issuedRadiusSecret, 'radius')}
                                        caption="Rời khỏi trang này sẽ không xem lại được — nếu mất, cấp secret mới (secret cũ sẽ bị vô hiệu ngay, router dùng secret cũ sẽ bị RADIUS server từ chối)."
                                    />
                                ) : device.radius_secret_configured ? (
                                    <p>Đã cấu hình — cấp lúc {device.radius_secret_issued_at ? new Date(device.radius_secret_issued_at).toLocaleString('vi-VN') : 'không rõ'}. Server chỉ giữ credential_ref trỏ tới biến môi trường (ADR-05), không lưu secret thật trong DB.</p>
                                ) : (
                                    <p className="muted-text">Chưa cấp secret RADIUS cho thiết bị này — mọi gói Accounting-Request/Access-Request thật từ router sẽ bị server âm thầm bỏ qua.</p>
                                )}
                                {radiusSecretError && <p style={{ color: '#dc2626', fontSize: 12 }}>{radiusSecretError}</p>}
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <button type="button" className="filter-apply" disabled={radiusSecretBusy} onClick={() => void issueRadiusSecret()}>{radiusSecretBusy ? 'Đang xử lý…' : device.radius_secret_configured ? 'Cấp lại secret' : 'Tạo secret RADIUS'}</button>
                                    {device.radius_secret_configured && <button type="button" className="button-secondary compact-button" disabled={radiusSecretBusy} onClick={() => void revokeRadiusSecret()}>Thu hồi secret</button>}
                                </div>
                            </div>

                            <div>
                                <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>Server URL (nhìn từ phía router — sửa lại nếu router không tới được địa chỉ này, vd domain/IP công khai thật)</span>
                                <input type="text" value={serverUrl} onChange={e => setServerUrl(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 12, fontFamily: 'monospace', fontSize: 12 }} />

                                <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>Script RouterOS — dán vào System → Scheduler → (+) → On Event, Interval = 00:05:00</span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <textarea readOnly value={routerOsScript} rows={14} style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', background: '#0f172a', color: '#e2e8f0', resize: 'vertical' }} />
                                </div>
                                <button type="button" className="button-secondary compact-button" style={{ marginTop: 8 }} onClick={() => void copyText(routerOsScript, 'script')}>{copyFeedback === 'script' ? 'Đã chép ✓' : 'Sao chép script'}</button>
                                {!issuedKey && <p className="muted-text" style={{ fontSize: 12, marginTop: 4 }}>Script trên đang dùng placeholder cho API key — bấm "Tạo API key" ở trên để script tự điền key thật.</p>}
                            </div>

                            <div className="dashboard-meta" style={{ marginTop: 16, marginBottom: 20 }}>
                                <span><strong>Lần nhận dữ liệu gần nhất:</strong> {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('vi-VN') : 'Chưa nhận được push nào'}</span>
                            </div>

                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
                                <div className="section-heading">
                                    <div><h2>Cấu hình NetFlow + DNS log (phân tích theo dịch vụ)</h2><p>WAN dùng bao nhiêu cho YouTube/TikTok/... — ghép NetFlow v9 (byte tới IP nào) với DNS log (IP đó là dịch vụ gì). Dùng chung Server URL ở trên; chỉ THÊM vào router, không đổi cấu hình nào khác.</p></div>
                                </div>
                                <span className="muted-text" style={{ display: 'block', marginBottom: 4 }}>Cấu hình — dán vào Terminal (không phải Scheduler), chạy 1 lần</span>
                                <textarea readOnly value={netflowDnsScript} rows={10} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', background: '#0f172a', color: '#e2e8f0', resize: 'vertical' }} />
                                <button type="button" className="button-secondary compact-button" style={{ marginTop: 8 }} onClick={() => void copyText(netflowDnsScript, 'netflow-dns')}>{copyFeedback === 'netflow-dns' ? 'Đã chép ✓' : 'Sao chép cấu hình'}</button>
                                <p className="muted-text" style={{ fontSize: 12, marginTop: 8 }}>Địa chỉ đích lấy trực tiếp từ Server URL ở trên (host: <code>{extractHost(serverUrl)}</code>) — sửa Server URL nếu router cần tới một địa chỉ khác cho NetFlow/DNS log so với push telemetry. Sau khi dán, kiểm tra dữ liệu thật ở tab CREW/BUSINESS trên trang Tàu (không phải trang này — trang này chỉ quản lý 1 thiết bị, còn CREW/BUSINESS là theo cả tàu).</p>
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
