import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DefaultService, SettingsService, TenantsService } from '../api';
import { InventoryService } from '../api/services/InventoryService';
import { Device } from '../api/models/Device';
import type { ShipItem } from '../api/models/ShipItem';
import type { Tenant } from '../api/models/Tenant';
import { Router, Activity, AlertCircle, RefreshCw, Circle, CheckCircle2, Shuffle } from 'lucide-react';
import { combineBytes, formatBytes, formatLastSeen, getApiErrorInfo } from '../lib/dashboard';
import { buildFleetConfigFromOptions, DEFAULT_FLEET_CONFIG_OPTIONS, type FleetConfigOptions, type WanMode } from '../lib/routerosConfigTemplate';
import { generateRandomHex } from '../lib/randomToken';

const DEFAULT_AREA_CODE = 'DEFAULT';

const emptyShipForm = { code: '', name: '', tenantId: '' };
const emptyDeviceForm = { code: '', name: '', role: 'EDGE' as Device.role, model: '' };

type WizardStep = 1 | 2 | 3;

function defaultWanInterface(index: number): string {
    // ether13 khớp cổng Starlink thật trên fleet hiện có (Hai Nam 81) -- các WAN kế tiếp đoán tiếp
    // theo dãy, người dùng tự sửa lại cho khớp router thật của họ.
    return `ether${13 + index}`;
}

export const Devices: React.FC = () => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [ships, setShips] = useState<ShipItem[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyDeviceId, setBusyDeviceId] = useState('');

    // Tong dung luong (download+upload gop, 30 ngay gan nhat) tung thiet bi -- fetch rieng SAU khi
    // co danh sach thiet bi (N request song song, N nho vi day la so thiet bi 1 ham doi thuc te,
    // khong phai bang lon can 1 endpoint tong hop rieng). null = chua co interface_counter_deltas
    // nao (INSUFFICIENT_DATA that hoac loi mang) -- hien "Chưa có dữ liệu", KHONG hien 0.
    const [deviceUsageBytes, setDeviceUsageBytes] = useState<Record<string, number | null>>({});
    const [usageLoading, setUsageLoading] = useState(false);

    // Thanh bar do theo thiet bi dung nhieu nhat trong danh sach, khong phai theo mot tran co dinh
    // -- de so sanh tuong doi giua cac may van doc duoc du tong luu luong thang nay cao hay thap.
    const maxUsageBytes = useMemo(() => {
        const values = Object.values(deviceUsageBytes).filter((v): v is number => typeof v === 'number' && v > 0);
        return values.length > 0 ? Math.max(...values) : 0;
    }, [deviceUsageBytes]);
    const usageBarPct = (value: number | null | undefined) => {
        if (!value || maxUsageBytes <= 0) return 0;
        return Math.max(2, Math.round((value / maxUsageBytes) * 100));
    };

    // Wizard: bước 1 (tàu + thiết bị) -> bước 2 (cấu hình router) -> bước 3 (tokens + xuất cấu hình).
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardStep, setWizardStep] = useState<WizardStep>(1);
    const [wizardError, setWizardError] = useState('');
    const [wizardBusy, setWizardBusy] = useState(false);

    const [shipMode, setShipMode] = useState<'existing' | 'new'>('existing');
    const [selectedShipId, setSelectedShipId] = useState('');
    const [shipForm, setShipForm] = useState(emptyShipForm);
    const [deviceForm, setDeviceForm] = useState(emptyDeviceForm);

    const [configOptions, setConfigOptions] = useState<FleetConfigOptions>(DEFAULT_FLEET_CONFIG_OPTIONS);
    // Dia chi server lay tu Settings, KHONG hard-code. Truoc day file sinh config ghi cung
    // 10.149.79.186 -- dung may nhung sai network: router di qua ZeroTier va chi toi duoc
    // 172.29.1.186, nen moi config sinh ra tu man hinh nay deu tro sai dich.
    const [serverAddress, setServerAddress] = useState<string | null>(null);

    const [createdDevice, setCreatedDevice] = useState<Device>();
    const [pushKeyInput, setPushKeyInput] = useState('');
    const [pushKeySaved, setPushKeySaved] = useState(false);
    const [radiusSecretInput, setRadiusSecretInput] = useState('');
    const [radiusSecretSaved, setRadiusSecretSaved] = useState(false);
    const [tokenBusy, setTokenBusy] = useState<'push' | 'radius' | ''>('');
    const [tokenError, setTokenError] = useState('');
    const [copyFeedback, setCopyFeedback] = useState('');

    const fetchDevices = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [devicesRes, shipsRes, tenantsRes] = await Promise.all([
                InventoryService.getDevices({}),
                DefaultService.getShips({}),
                TenantsService.getTenants({}),
            ]);
            setDevices(devicesRes.data || []);
            setShips(shipsRes.data ?? []);
            setTenants(tenantsRes.data ?? []);
        } catch (err) {
            setError(getApiErrorInfo(err).message);
        } finally {
            setLoading(false);
        }
    }, []);

    // This effect synchronizes the page with the external API; its async callback owns loading/error state.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchDevices(); }, [fetchDevices]);

    const fetchDeviceUsage = useCallback(async (list: Device[]) => {
        const ids = list.map(d => d.id).filter((id): id is string => !!id);
        if (ids.length === 0) return;
        setUsageLoading(true);
        const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const results = await Promise.allSettled(ids.map(id => InventoryService.getDevicesTraffic({ deviceId: id, from })));
        const next: Record<string, number | null> = {};
        results.forEach((result, i) => {
            next[ids[i]] = result.status === 'fulfilled' ? combineBytes(result.value.data?.wan?.download_bytes, result.value.data?.wan?.upload_bytes) : null;
        });
        setUsageLoading(false);
        // oxlint-disable-next-line react/set-state-in-effect
        setDeviceUsageBytes(next);
    }, []);

    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { if (devices.length > 0) void fetchDeviceUsage(devices); }, [devices, fetchDeviceUsage]);

    const deleteDevice = async (device: Device) => {
        if (!device.id) return;
        if (!window.confirm(`Xoá thiết bị "${device.name ?? device.code}"? Toàn bộ cấu hình, token và lịch sử traffic gắn với thiết bị này sẽ không còn hiển thị ở đâu nữa.`)) return;
        setBusyDeviceId(device.id);
        try {
            await InventoryService.deleteDevices({ deviceId: device.id });
            await fetchDevices();
        } catch (err) {
            setError(getApiErrorInfo(err).message);
        } finally {
            setBusyDeviceId('');
        }
    };

    // Moi tau chi duoc gan DUNG 1 thiet bi Smartbox (backend chan luon o devices.service.ts) --
    // loc san danh sach tau con "trong" (chua co thiet bi nao) o day de nguoi dung khong chon
    // nham 1 tau da co roi, thay vi de rot xuong loi 409 sau khi dien het form.
    const shipIdsWithDevice = useMemo(() => new Set(devices.map(d => d.ship_id).filter((id): id is string => !!id)), [devices]);
    const availableShips = useMemo(() => ships.filter(s => s.id && !shipIdsWithDevice.has(s.id)), [ships, shipIdsWithDevice]);

    const openWizard = () => {
        setWizardStep(1);
        setWizardError('');
        setShipMode(availableShips.length > 0 ? 'existing' : 'new');
        setSelectedShipId(availableShips[0]?.id ?? '');
        setShipForm(emptyShipForm);
        setDeviceForm(emptyDeviceForm);
        setConfigOptions(DEFAULT_FLEET_CONFIG_OPTIONS);
        setCreatedDevice(undefined);
        setPushKeyInput('');
        setPushKeySaved(false);
        setRadiusSecretInput('');
        setRadiusSecretSaved(false);
        setTokenError('');
        setWizardOpen(true);
    };

    const closeWizard = () => {
        setWizardOpen(false);
        void fetchDevices();
    };

    const setWanCount = (count: 1 | 2 | 3) => {
        setConfigOptions(prev => {
            const wanInterfaces = Array.from({ length: count }, (_, i) => prev.wanInterfaces[i] ?? defaultWanInterface(i));
            return { ...prev, wanCount: count, wanMode: count === 1 ? 'single' : prev.wanMode === 'single' ? 'failover' : prev.wanMode, wanInterfaces };
        });
    };

    // Khu vực mặc định (không lộ khái niệm "khu vực" ra UI) -- cùng cách ShipDashboard.tsx tạo tàu mới.
    const ensureDefaultAreaId = async (): Promise<string> => {
        const existing = await DefaultService.getAreas({});
        const found = (existing.data ?? [])[0]?.id;
        if (found) return found;
        const created = await InventoryService.postAreas({ requestBody: { code: DEFAULT_AREA_CODE, name: 'Khu vực mặc định', timezone: 'UTC' } });
        if (!created.data?.id) throw new Error('Không tạo được khu vực mặc định');
        return created.data.id;
    };

    const submitStep1 = (e: React.FormEvent) => {
        e.preventDefault();
        setWizardError('');
        if (shipMode === 'existing' && !selectedShipId) { setWizardError('Chọn 1 tàu.'); return; }
        if (shipMode === 'new' && (!shipForm.code.trim() || !shipForm.name.trim())) { setWizardError('Điền đủ mã và tên tàu.'); return; }
        if (!deviceForm.code.trim() || !deviceForm.name.trim()) { setWizardError('Điền đủ mã và tên thiết bị.'); return; }
        setWizardStep(2);
    };

    const submitStep2 = async (e: React.FormEvent) => {
        e.preventDefault();
        setWizardError('');
        setWizardBusy(true);
        try {
            let shipId = selectedShipId;
            if (shipMode === 'new') {
                const areaId = await ensureDefaultAreaId();
                const shipRes = await InventoryService.postShips({
                    requestBody: { area_id: areaId, code: shipForm.code, name: shipForm.name, tenant_id: shipForm.tenantId || null },
                });
                if (!shipRes.data?.id) throw new Error('Không tạo được tàu mới');
                shipId = shipRes.data.id;
            }

            const deviceRes = await InventoryService.postDevices({
                requestBody: { ship_id: shipId, code: deviceForm.code, name: deviceForm.name, role: deviceForm.role, model: deviceForm.model || null },
            });
            setCreatedDevice(deviceRes.data);
            setWizardStep(3);
        } catch (err) {
            setWizardError(getApiErrorInfo(err).message);
        } finally {
            setWizardBusy(false);
        }
    };

    useEffect(() => {
        void (async () => {
            try {
                const res = await SettingsService.getSettings();
                setServerAddress(res.data?.radius_server_address ?? null);
            } catch {
                // Thieu quyen settings:read hoac DB down -- de null, bo sinh config se in placeholder
                // thay vi am tham dan mot dia chi sai.
                setServerAddress(null);
            }
        })();
    }, []);

    const generatedConfig = useMemo(
        () => buildFleetConfigFromOptions({ ...configOptions, radiusSecret: radiusSecretInput || '<RADIUS_SECRET>', serverAddress }),
        [configOptions, radiusSecretInput, serverAddress],
    );

    const copyText = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyFeedback(label);
            setTimeout(() => setCopyFeedback(''), 2000);
        } catch {
            setCopyFeedback('');
        }
    };

    const savePushKey = async () => {
        if (!createdDevice?.id || pushKeyInput.length < 8) return;
        setTokenBusy('push');
        setTokenError('');
        try {
            await InventoryService.postDevicesPushKey({ deviceId: createdDevice.id, requestBody: { api_key: pushKeyInput } });
            setPushKeySaved(true);
        } catch (err) {
            setTokenError(getApiErrorInfo(err).message);
        } finally {
            setTokenBusy('');
        }
    };

    const saveRadiusSecret = async () => {
        if (!createdDevice?.id || radiusSecretInput.length < 4) return;
        setTokenBusy('radius');
        setTokenError('');
        try {
            await InventoryService.postDevicesRadiusSecret({ deviceId: createdDevice.id, requestBody: { secret: radiusSecretInput } });
            setRadiusSecretSaved(true);
        } catch (err) {
            setTokenError(getApiErrorInfo(err).message);
        } finally {
            setTokenBusy('');
        }
    };

    const total = devices.length;
    const online = devices.filter(d => d.status === 'ONLINE').length;
    const offline = devices.filter(d => d.status === 'OFFLINE').length;
    const degraded = devices.filter(d => d.status === 'DEGRADED').length;

    const toggleMaintenance = async (device: Device) => {
        if (!device.id) return;
        setBusyDeviceId(device.id);
        try {
            await InventoryService.patchDevices({
                deviceId: device.id,
                requestBody: { status: device.status === Device.status.MAINTENANCE ? Device.status.ONLINE : Device.status.MAINTENANCE },
            });
            await fetchDevices();
        } catch (err) {
            setError(getApiErrorInfo(err).message);
        } finally {
            setBusyDeviceId('');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: '"Inter", sans-serif' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <div style={{ background: 'linear-gradient(135deg, #276f9c 0%, #17496d 100%)', borderRadius: '12px', padding: '20px', border: 'none', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 6px 18px -10px rgba(9, 38, 61, 0.55)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#fff', fontWeight: '600', letterSpacing: '0.04em' }}>TỔNG THIẾT BỊ</span>
                        <Router size={18} color="#a9cfe6" />
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff' }}>{total}</span>
                    <span style={{ fontSize: '12px', color: '#a9cfe6' }}>+0 thiết bị mới</span>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', borderLeft: '3px solid #10b981', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>TRỰC TUYẾN (ONLINE)</span>
                        <CheckCircle2 size={18} color="#10b981" />
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>{online}</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Đang hoạt động ổn định</span>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', borderLeft: '3px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>CẢNH BÁO (DEGRADED)</span>
                        <Activity size={18} color="#f59e0b" />
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#f59e0b' }}>{degraded}</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Cần kiểm tra lại</span>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', borderLeft: '3px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>MẤT KẾT NỐI (OFFLINE)</span>
                        <AlertCircle size={18} color="#ef4444" />
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#ef4444' }}>{offline}</span>
                    <span style={{ fontSize: '12px', color: '#ef4444' }}>Cần xử lý ngay</span>
                </div>
            </div>

            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>Danh sách thiết bị</h3>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => void fetchDevices()} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid #e2e8f0', color: '#334155', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseOut={(e) => e.currentTarget.style.background = 'white'}>
                            <RefreshCw size={14} className={loading ? "spin" : ""} /> Tải lại danh sách
                        </button>
                        <button onClick={openWizard} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#146ca8', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#0e4f7d'} onMouseOut={(e) => e.currentTarget.style.background = '#146ca8'}>
                            <span>+</span> Thêm thiết bị
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: '#64748b' }}>
                        <RefreshCw size={32} className="spin" color="#146ca8" />
                        <span>Đang tải dữ liệu thiết bị...</span>
                    </div>
                ) : error ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Lỗi: {error}</div>
                ) : devices.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Không có thiết bị nào trong hệ thống.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Tên thiết bị</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Trạng thái</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Lần truy cập gần nhất</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Model</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Năm sản xuất / OS</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Tổng dung lượng (30 ngày)</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {devices.map(device => (
                                    <tr key={device.id} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '14px', color: '#334155', transition: 'background 0.15s' }} onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{device.name || device.code || device.id}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            {device.status === 'ONLINE' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: '500' }}><Circle size={10} fill="#10b981" color="#10b981" /> Online</span>}
                                            {device.status === 'DEGRADED' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: '500' }}><Circle size={10} fill="#f59e0b" color="#f59e0b" /> Degraded</span>}
                                            {device.status === 'OFFLINE' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: '500' }}><Circle size={10} fill="#ef4444" color="#ef4444" /> Offline</span>}
                                            {device.status === 'MAINTENANCE' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontWeight: '500' }}><Circle size={10} fill="#64748b" color="#64748b" /> Bảo trì</span>}
                                            {(!device.status || device.status === 'UNKNOWN') && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontWeight: '500' }}><Circle size={10} fill="#94a3b8" color="#94a3b8" /> Unknown</span>}
                                        </td>
                                        <td style={{ padding: '16px 20px' }} title={formatLastSeen(device.last_seen_at).title}>
                                            <span style={{ color: formatLastSeen(device.last_seen_at).muted ? '#94a3b8' : '#475569' }}>
                                                {formatLastSeen(device.last_seen_at).text}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 20px', color: '#475569' }}>
                                            {device.model || '-'}
                                        </td>
                                        <td style={{ padding: '16px 20px', color: '#475569' }}>
                                            {device.routeros_version || '-'}
                                        </td>
                                        <td style={{ padding: '16px 20px', color: '#475569' }}>
                                            {!device.id || (usageLoading && !(device.id in deviceUsageBytes)) ? (
                                                <span style={{ color: '#94a3b8' }}>Đang tải…</span>
                                            ) : deviceUsageBytes[device.id] == null ? (
                                                <span style={{ color: '#94a3b8' }}>Chưa có dữ liệu</span>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '180px' }}>
                                                    <div style={{ flex: 1, height: '8px', background: '#e8eef4', borderRadius: '4px', overflow: 'hidden' }}>
                                                        <div style={{ width: usageBarPct(deviceUsageBytes[device.id]) + '%', height: '100%', background: '#146ca8', borderRadius: '4px' }} />
                                                    </div>
                                                    <strong style={{ color: '#0f172a', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', minWidth: '76px', textAlign: 'right' }}>{formatBytes(deviceUsageBytes[device.id]).value} {formatBytes(deviceUsageBytes[device.id]).unit}</strong>
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button disabled={busyDeviceId === device.id} onClick={() => void toggleMaintenance(device)} style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                                                    {device.status === 'MAINTENANCE' ? 'Kích hoạt lại' : 'Bảo trì'}
                                                </button>
                                                <Link to={`/devices/${device.id}`} style={{ background: '#f0f9ff', color: '#0ea5e9', border: '1px solid #bae6fd', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>
                                                    Chi tiết
                                                </Link>
                                                <button disabled={busyDeviceId === device.id} onClick={() => void deleteDevice(device)} style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                                                    {busyDeviceId === device.id ? 'Đang xoá…' : 'Xoá'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {wizardOpen && (
                <div className="modal-overlay" role="dialog" onClick={() => setWizardOpen(false)}>
                    <div className="modal-card" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', maxWidth: 640, width: '100%' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>
                                {wizardStep === 1 ? 'Bước 1/3 — Tàu & thiết bị' : wizardStep === 2 ? 'Bước 2/3 — Cấu hình router' : 'Bước 3/3 — Tokens & xuất cấu hình'}
                            </h3>
                            <button onClick={() => setWizardOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                        </div>

                        {wizardStep === 1 && (
                            <form onSubmit={submitStep1} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
                                <div className="tab-row" role="tablist">
                                    <button type="button" role="tab" aria-selected={shipMode === 'existing'} className={shipMode === 'existing' ? 'active' : ''} onClick={() => setShipMode('existing')} disabled={availableShips.length === 0}>Tàu có sẵn</button>
                                    <button type="button" role="tab" aria-selected={shipMode === 'new'} className={shipMode === 'new' ? 'active' : ''} onClick={() => setShipMode('new')}>Tạo tàu mới</button>
                                </div>

                                {shipMode === 'existing' ? (
                                    <label className="filter-control"><span>Tàu</span>
                                        <select className="filter-select" required value={selectedShipId} onChange={e => setSelectedShipId(e.target.value)}>
                                            <option value="">-- chọn tàu --</option>
                                            {availableShips.map(s => <option key={s.id} value={s.id}>{s.name ?? s.code}</option>)}
                                        </select>
                                        <span className="muted-text" style={{ fontSize: 12 }}>Chỉ hiện tàu chưa có thiết bị nào — mỗi tàu chỉ được gán đúng 1 Smartbox.{ships.length > availableShips.length ? ` (${ships.length - availableShips.length} tàu đã có thiết bị, không hiện ở đây)` : ''}</span>
                                    </label>
                                ) : (
                                    <>
                                        <label className="filter-control"><span>Mã tàu</span><input className="filter-select" required value={shipForm.code} onChange={e => setShipForm({ ...shipForm, code: e.target.value })} placeholder="vd: SHIP-02" /></label>
                                        <label className="filter-control"><span>Tên tàu</span><input className="filter-select" required value={shipForm.name} onChange={e => setShipForm({ ...shipForm, name: e.target.value })} /></label>
                                    </>
                                )}

                                <label className="filter-control"><span>Đại lý quản lý (tuỳ chọn)</span>
                                    <select className="filter-select" value={shipForm.tenantId} onChange={e => setShipForm({ ...shipForm, tenantId: e.target.value })} disabled={shipMode === 'existing'}>
                                        <option value="">-- chưa gán --</option>
                                        {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                                    </select>
                                    {shipMode === 'existing' && <span className="muted-text" style={{ fontSize: 12 }}>Sửa đại lý của tàu có sẵn ở trang Tàu, không phải ở đây.</span>}
                                </label>

                                <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

                                <label className="filter-control"><span>Mã thiết bị</span><input className="filter-select" required value={deviceForm.code} onChange={e => setDeviceForm({ ...deviceForm, code: e.target.value })} /></label>
                                <label className="filter-control"><span>Tên thiết bị</span><input className="filter-select" required value={deviceForm.name} onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })} /></label>
                                <label className="filter-control"><span>Vai trò</span>
                                    <select className="filter-select" value={deviceForm.role} onChange={e => setDeviceForm({ ...deviceForm, role: e.target.value as Device.role })}>
                                        <option value="EDGE">EDGE</option>
                                        <option value="CORE">CORE</option>
                                        <option value="SWITCH">SWITCH</option>
                                        <option value="AP">AP</option>
                                        <option value="CPE">CPE</option>
                                    </select>
                                </label>
                                <label className="filter-control"><span>Model (tuỳ chọn)</span><input className="filter-select" value={deviceForm.model} onChange={e => setDeviceForm({ ...deviceForm, model: e.target.value })} placeholder="vd: RB5009UG+S+" /></label>

                                {wizardError && <div style={{ color: '#ef4444', fontSize: '13px' }}>{wizardError}</div>}
                                <button type="submit" style={{ background: '#146ca8', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Tiếp tục</button>
                            </form>
                        )}

                        {wizardStep === 2 && (
                            <form onSubmit={submitStep2} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
                                <label className="filter-control"><span>Số lượng WAN</span>
                                    <select className="filter-select" value={configOptions.wanCount} onChange={e => setWanCount(Number(e.target.value) as 1 | 2 | 3)}>
                                        <option value={1}>1 WAN</option>
                                        <option value={2}>2 WAN</option>
                                        <option value={3}>3 WAN</option>
                                    </select>
                                </label>

                                {configOptions.wanCount > 1 && (
                                    <label className="filter-control"><span>Kiểu nhiều WAN</span>
                                        <select className="filter-select" value={configOptions.wanMode} onChange={e => setConfigOptions({ ...configOptions, wanMode: e.target.value as WanMode })}>
                                            <option value="failover">Failover (dự phòng, ưu tiên WAN1)</option>
                                            <option value="loadbalance">Cân bằng tải (PCC, dùng đồng thời)</option>
                                        </select>
                                    </label>
                                )}

                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {configOptions.wanInterfaces.map((name, i) => (
                                        <label className="filter-control" key={i} style={{ flex: '1 1 140px' }}><span>Interface vật lý WAN{i + 1}</span>
                                            <input className="filter-select" value={name} onChange={e => {
                                                const next = [...configOptions.wanInterfaces];
                                                next[i] = e.target.value;
                                                setConfigOptions({ ...configOptions, wanInterfaces: next });
                                            }} placeholder={`vd: ${defaultWanInterface(i)}`} />
                                        </label>
                                    ))}
                                </div>

                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="checkbox" checked={configOptions.enableCrewHotspot} onChange={e => setConfigOptions({ ...configOptions, enableCrewHotspot: e.target.checked })} />
                                    <span>Bridge CREW + Hotspot + RADIUS</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="checkbox" checked={configOptions.enableBusiness} onChange={e => setConfigOptions({ ...configOptions, enableBusiness: e.target.checked })} />
                                    <span>Bridge BUSINESS</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="checkbox" checked={configOptions.enableZeroTier} onChange={e => setConfigOptions({ ...configOptions, enableZeroTier: e.target.checked })} />
                                    <span>ZeroTier (VPN quản trị)</span>
                                </label>

                                <p className="muted-text" style={{ fontSize: 12 }}>
                                    Địa chỉ server RADIUS/NetFlow/DNS log: {serverAddress
                                        ? <code>{serverAddress}</code>
                                        : <span style={{ color: 'var(--warning)' }}>chưa đặt — vào Cài đặt → RADIUS điền trước, nếu không lệnh sinh ra sẽ còn chỗ trống</span>}
                                    {' '}· cổng UDP 1813/2055/5514.
                                </p>

                                {wizardError && <div style={{ color: '#ef4444', fontSize: '13px' }}>{wizardError}</div>}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" className="button-secondary compact-button" onClick={() => setWizardStep(1)}>← Quay lại</button>
                                    <button type="submit" disabled={wizardBusy} style={{ flex: 1, background: '#146ca8', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                                        {wizardBusy ? 'Đang tạo…' : 'Tạo thiết bị & xuất cấu hình'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {wizardStep === 3 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
                                <p style={{ margin: 0 }}>Đã tạo thiết bị <strong>{createdDevice?.name}</strong>. Đặt token trước khi dán cấu hình xuống router — bấm <Shuffle size={12} style={{ verticalAlign: -1 }} /> để tự sinh giá trị mạnh, hoặc tự gõ tay.</p>

                                <div className="settings-field" style={{ maxWidth: 320 }}>
                                    <label>Push API key (tối thiểu 8 ký tự)</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className="filter-select" type="text" minLength={8} value={pushKeyInput} onChange={e => { setPushKeyInput(e.target.value); setPushKeySaved(false); }} placeholder="Tự đặt push API key" style={{ fontFamily: 'var(--font-mono)' }} />
                                        <button type="button" className="button-secondary compact-button" title="Tự sinh giá trị ngẫu nhiên" onClick={() => { setPushKeyInput(generateRandomHex(32)); setPushKeySaved(false); }}><Shuffle size={14} /></button>
                                        <button type="button" className="filter-apply" disabled={tokenBusy !== '' || pushKeyInput.length < 8} onClick={() => void savePushKey()}>{tokenBusy === 'push' ? 'Đang lưu…' : pushKeySaved ? 'Đã lưu ✓' : 'Lưu'}</button>
                                    </div>
                                </div>
                                <div className="settings-field" style={{ maxWidth: 320 }}>
                                    <label>RADIUS secret (tối thiểu 4 ký tự)</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className="filter-select" type="text" minLength={4} value={radiusSecretInput} onChange={e => { setRadiusSecretInput(e.target.value); setRadiusSecretSaved(false); }} placeholder="Tự đặt RADIUS secret" style={{ fontFamily: 'var(--font-mono)' }} />
                                        <button type="button" className="button-secondary compact-button" title="Tự sinh giá trị ngẫu nhiên" onClick={() => { setRadiusSecretInput(generateRandomHex(24)); setRadiusSecretSaved(false); }}><Shuffle size={14} /></button>
                                        <button type="button" className="filter-apply" disabled={tokenBusy !== '' || radiusSecretInput.length < 4} onClick={() => void saveRadiusSecret()}>{tokenBusy === 'radius' ? 'Đang lưu…' : radiusSecretSaved ? 'Đã lưu ✓' : 'Lưu'}</button>
                                    </div>
                                </div>
                                {tokenError && <div style={{ color: '#ef4444', fontSize: '13px' }}>{tokenError}</div>}

                                <span className="muted-text" style={{ display: 'block' }}>Cấu hình router — dán vào Terminal (RouterOS mới toanh, chưa có gì để không đổi cấu hình cũ){radiusSecretInput ? ' — đã điền sẵn RADIUS secret thật ở trên' : ' — chưa đặt RADIUS secret nên secret= còn để placeholder'}.</span>
                                <textarea readOnly value={generatedConfig} rows={14} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', background: '#0f172a', color: '#e2e8f0', resize: 'vertical' }} />
                                <button type="button" className="button-secondary compact-button" onClick={() => void copyText(generatedConfig, 'config')}>{copyFeedback === 'config' ? 'Đã chép ✓' : 'Sao chép cấu hình'}</button>

                                <button type="button" onClick={closeWizard} style={{ background: '#146ca8', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Xong</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
};
