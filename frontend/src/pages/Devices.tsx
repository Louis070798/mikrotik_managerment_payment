import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DefaultService, TenantsService } from '../api';
import { InventoryService } from '../api/services/InventoryService';
import { Device } from '../api/models/Device';
import type { ShipItem } from '../api/models/ShipItem';
import type { Tenant } from '../api/models/Tenant';
import { Router, Activity, AlertCircle, RefreshCw, Circle, CheckCircle2 } from 'lucide-react';
import { SecretReveal } from '../components/SecretReveal';
import { getApiErrorInfo } from '../lib/dashboard';
import { buildFleetConfigFromOptions, DEFAULT_FLEET_CONFIG_OPTIONS, type FleetConfigOptions, type WanMode } from '../lib/routerosConfigTemplate';

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

    const [createdDevice, setCreatedDevice] = useState<Device>();
    const [pushKey, setPushKey] = useState<string>();
    const [radiusSecret, setRadiusSecret] = useState<{ credential_ref: string; secret: string }>();
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

    const openWizard = () => {
        setWizardStep(1);
        setWizardError('');
        setShipMode(ships.length > 0 ? 'existing' : 'new');
        setSelectedShipId(ships[0]?.id ?? '');
        setShipForm(emptyShipForm);
        setDeviceForm(emptyDeviceForm);
        setConfigOptions(DEFAULT_FLEET_CONFIG_OPTIONS);
        setCreatedDevice(undefined);
        setPushKey(undefined);
        setRadiusSecret(undefined);
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

    const generatedConfig = useMemo(
        () => buildFleetConfigFromOptions({ ...configOptions, radiusSecret: radiusSecret?.secret ?? '<RADIUS_SECRET>' }),
        [configOptions, radiusSecret],
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

    const issuePushKey = async () => {
        if (!createdDevice?.id) return;
        setTokenBusy('push');
        setTokenError('');
        try {
            const res = await InventoryService.postDevicesPushKey({ deviceId: createdDevice.id });
            setPushKey(res.data?.api_key);
        } catch (err) {
            setTokenError(getApiErrorInfo(err).message);
        } finally {
            setTokenBusy('');
        }
    };

    const issueRadiusSecret = async () => {
        if (!createdDevice?.id) return;
        setTokenBusy('radius');
        setTokenError('');
        try {
            const res = await InventoryService.postDevicesRadiusSecret({ deviceId: createdDevice.id });
            if (res.data?.credential_ref && res.data?.secret) setRadiusSecret({ credential_ref: res.data.credential_ref, secret: res.data.secret });
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
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>TỔNG THIẾT BỊ</span>
                        <Router size={18} color="#0ea5e9" />
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#0f172a' }}>{total}</span>
                    <span style={{ fontSize: '12px', color: '#10b981' }}>+0 thiết bị mới</span>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>TRỰC TUYẾN (ONLINE)</span>
                        <CheckCircle2 size={18} color="#10b981" />
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>{online}</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Đang hoạt động ổn định</span>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '600' }}>CẢNH BÁO (DEGRADED)</span>
                        <Activity size={18} color="#f59e0b" />
                    </div>
                    <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#f59e0b' }}>{degraded}</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Cần kiểm tra lại</span>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
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
                        <button onClick={openWizard} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#009688', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#00796b'} onMouseOut={(e) => e.currentTarget.style.background = '#009688'}>
                            <span>+</span> Thêm thiết bị
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: '#64748b' }}>
                        <RefreshCw size={32} className="spin" color="#009688" />
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
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Vai trò (Role)</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Trạng thái</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Model</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600' }}>Năm sản xuất / OS</th>
                                    <th style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: '600', textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {devices.map(device => (
                                    <tr key={device.id} style={{ borderBottom: '1px solid #e2e8f0', fontSize: '14px', color: '#334155', transition: 'background 0.15s' }} onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: '600', color: '#0f172a' }}>{device.name || device.code || device.id}</span>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>{device.code}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            <span style={{ background: '#e2e8f0', color: '#334155', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                                                {device.role || 'UNKNOWN'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 20px' }}>
                                            {device.status === 'ONLINE' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: '500' }}><Circle size={10} fill="#10b981" color="#10b981" /> Online</span>}
                                            {device.status === 'DEGRADED' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: '500' }}><Circle size={10} fill="#f59e0b" color="#f59e0b" /> Degraded</span>}
                                            {device.status === 'OFFLINE' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: '500' }}><Circle size={10} fill="#ef4444" color="#ef4444" /> Offline</span>}
                                            {device.status === 'MAINTENANCE' && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontWeight: '500' }}><Circle size={10} fill="#64748b" color="#64748b" /> Bảo trì</span>}
                                            {(!device.status || device.status === 'UNKNOWN') && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontWeight: '500' }}><Circle size={10} fill="#94a3b8" color="#94a3b8" /> Unknown</span>}
                                        </td>
                                        <td style={{ padding: '16px 20px', color: '#475569' }}>
                                            {device.model || '-'}
                                        </td>
                                        <td style={{ padding: '16px 20px', color: '#475569' }}>
                                            {device.routeros_version || '-'}
                                        </td>
                                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button disabled={busyDeviceId === device.id} onClick={() => void toggleMaintenance(device)} style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                                                    {device.status === 'MAINTENANCE' ? 'Kích hoạt lại' : 'Bảo trì'}
                                                </button>
                                                <Link to={`/devices/${device.id}`} style={{ background: '#f0f9ff', color: '#0ea5e9', border: '1px solid #bae6fd', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>
                                                    Chi tiết
                                                </Link>
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
                                    <button type="button" role="tab" aria-selected={shipMode === 'existing'} className={shipMode === 'existing' ? 'active' : ''} onClick={() => setShipMode('existing')} disabled={ships.length === 0}>Tàu có sẵn</button>
                                    <button type="button" role="tab" aria-selected={shipMode === 'new'} className={shipMode === 'new' ? 'active' : ''} onClick={() => setShipMode('new')}>Tạo tàu mới</button>
                                </div>

                                {shipMode === 'existing' ? (
                                    <label className="filter-control"><span>Tàu</span>
                                        <select className="filter-select" required value={selectedShipId} onChange={e => setSelectedShipId(e.target.value)}>
                                            <option value="">-- chọn tàu --</option>
                                            {ships.map(s => <option key={s.id} value={s.id}>{s.name ?? s.code}</option>)}
                                        </select>
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
                                <button type="submit" style={{ background: '#009688', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Tiếp tục</button>
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

                                <p className="muted-text" style={{ fontSize: 12 }}>Địa chỉ server RADIUS/NetFlow/DNS log (10.149.79.186) và cổng UDP (1813/2055/5514) luôn cố định, không đổi được ở đây.</p>

                                {wizardError && <div style={{ color: '#ef4444', fontSize: '13px' }}>{wizardError}</div>}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" className="button-secondary compact-button" onClick={() => setWizardStep(1)}>← Quay lại</button>
                                    <button type="submit" disabled={wizardBusy} style={{ flex: 1, background: '#009688', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                                        {wizardBusy ? 'Đang tạo…' : 'Tạo thiết bị & xuất cấu hình'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {wizardStep === 3 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px', maxHeight: '75vh', overflowY: 'auto' }}>
                                <p style={{ margin: 0 }}>Đã tạo thiết bị <strong>{createdDevice?.name}</strong>. Cấp token trước khi dán cấu hình xuống router (secret/key thật chỉ hiện đúng 1 lần).</p>

                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button type="button" className="filter-apply" disabled={tokenBusy !== '' || !!pushKey} onClick={() => void issuePushKey()}>{tokenBusy === 'push' ? 'Đang tạo…' : pushKey ? 'Đã tạo Push API Key ✓' : 'Tạo Push API Key'}</button>
                                    <button type="button" className="filter-apply" disabled={tokenBusy !== '' || !!radiusSecret} onClick={() => void issueRadiusSecret()}>{tokenBusy === 'radius' ? 'Đang tạo…' : radiusSecret ? 'Đã tạo RADIUS Secret ✓' : 'Tạo RADIUS Secret'}</button>
                                </div>
                                {tokenError && <div style={{ color: '#ef4444', fontSize: '13px' }}>{tokenError}</div>}

                                {pushKey && (
                                    <SecretReveal heading="Push API Key — chỉ hiển thị 1 lần:" value={pushKey} copied={copyFeedback === 'push'} onCopy={() => void copyText(pushKey, 'push')} />
                                )}
                                {radiusSecret && (
                                    <SecretReveal
                                        heading={`RADIUS Secret — chỉ hiển thị 1 lần (${radiusSecret.credential_ref}):`}
                                        value={radiusSecret.secret}
                                        copied={copyFeedback === 'radius'}
                                        onCopy={() => void copyText(radiusSecret.secret, 'radius')}
                                    />
                                )}

                                <span className="muted-text" style={{ display: 'block' }}>Cấu hình router — dán vào Terminal (RouterOS mới toanh, chưa có gì để không đổi cấu hình cũ){radiusSecret ? ' — đã điền sẵn RADIUS secret thật ở trên' : ' — chưa cấp RADIUS Secret nên secret= còn để placeholder'}.</span>
                                <textarea readOnly value={generatedConfig} rows={14} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6, border: '1px solid #e2e8f0', background: '#0f172a', color: '#e2e8f0', resize: 'vertical' }} />
                                <button type="button" className="button-secondary compact-button" onClick={() => void copyText(generatedConfig, 'config')}>{copyFeedback === 'config' ? 'Đã chép ✓' : 'Sao chép cấu hình'}</button>

                                <button type="button" onClick={closeWizard} style={{ background: '#009688', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Xong</button>
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
