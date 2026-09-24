import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Eye, EyeOff, KeyRound, RadioTower, Server, ShieldCheck, Terminal, TriangleAlert, Users } from 'lucide-react';
import { CrewService, DefaultService, InventoryService, SettingsService } from '../api';
import type { CrewRadiusHealthResponse } from '../api/models/CrewRadiusHealthResponse';
import type { CrewUsersResponse } from '../api/models/CrewUsersResponse';
import type { Device } from '../api/models/Device';
import type { SettingsResponse } from '../api/models/SettingsResponse';
import type { ShipItem } from '../api/models/ShipItem';
import { DataStateNotice } from '../components/DataStateNotice';
import { MetricCard } from '../components/MetricCard';
import { formatCount, formatLastSeen, formatPercent, getApiErrorInfo, type MetricStatus } from '../lib/dashboard';
import { buildRouterOsRadiusScript, routerOsRadiusBlockers } from '../lib/routerosFleetCommands';

function radiusStatusClass(status?: string): MetricStatus {
    if (status === 'HEALTHY') return 'healthy';
    if (status === 'DEGRADED') return 'warning';
    if (status === 'UNHEALTHY') return 'critical';
    return 'unknown';
}

type ShipRadiusRow = { ship: ShipItem; health?: CrewRadiusHealthResponse; users?: CrewUsersResponse; error?: string };
type DeviceEditState = { ipAddress: string; saving: boolean; error: string; savedAt?: number };
/** Secret chỉ nằm trong state khi admin CHỦ ĐỘNG bấm "Hiện" — không prefetch cho cả bảng. */
type SecretState = { loading: boolean; value?: string; error?: string };

const monoInput: React.CSSProperties = { width: 140, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color, #e2e8f0)', fontFamily: 'monospace', fontSize: 12 };

/**
 * RADIUS / AAA — một chỗ duy nhất trả lời được 3 câu hỏi khi đấu một router MikroTik vào hệ thống:
 * server nằm ở đâu (địa chỉ + cổng), router này dùng secret gì, và dán lệnh nào vào RouterOS.
 *
 * RADIUS server ở đây chạy NGAY TRONG backend (libs/radius-server/, cả Access-Request PAP lẫn
 * Accounting, RFC 2865/2866) chứ không phải FreeRADIUS ngoài, nên không có gì để tra trong
 * service_endpoints — mọi thứ trên trang này đọc từ Settings (địa chỉ/cổng) và devices (NAS).
 *
 * Secret đọc lại được (GET /devices/{id}/radius-secret) vì nó vốn phải mã hoá 2 CHIỀU: server cần
 * đúng giá trị thật để tính lại Request-Authenticator. Mỗi lần bấm "Hiện" ghi 1 dòng audit
 * device.radius_secret_reveal — nói rõ điều đó ngay trên UI thay vì để người dùng đoán.
 */
export const RadiusAaa: React.FC = () => {
    const [ships, setShips] = useState<ShipItem[]>([]);
    const [shipRows, setShipRows] = useState<ShipRadiusRow[]>([]);
    const [monitorLoading, setMonitorLoading] = useState(true);
    const [monitorError, setMonitorError] = useState('');

    const [devices, setDevices] = useState<Device[]>([]);
    const [devicesLoading, setDevicesLoading] = useState(true);
    const [devicesError, setDevicesError] = useState('');
    const [shipNameById, setShipNameById] = useState<Record<string, string>>({});
    const [edits, setEdits] = useState<Record<string, DeviceEditState>>({});

    const [settings, setSettings] = useState<SettingsResponse['data']>();
    const [settingsError, setSettingsError] = useState('');

    const [secrets, setSecrets] = useState<Record<string, SecretState>>({});
    const [scriptDeviceId, setScriptDeviceId] = useState('');
    const [copied, setCopied] = useState('');

    const fetchMonitoring = useCallback(async () => {
        setMonitorLoading(true);
        setMonitorError('');
        try {
            const shipsRes = await DefaultService.getShips({});
            const shipList = shipsRes.data ?? [];
            setShips(shipList);
            const rows = await Promise.all(
                shipList.map(async (ship): Promise<ShipRadiusRow> => {
                    if (!ship.id) return { ship };
                    try {
                        const [health, users] = await Promise.all([
                            CrewService.getShipsCrewRadiusHealth({ shipId: ship.id }),
                            CrewService.getShipsCrewUsers({ shipId: ship.id }),
                        ]);
                        return { ship, health, users };
                    } catch (requestError) {
                        return { ship, error: getApiErrorInfo(requestError).message };
                    }
                }),
            );
            setShipRows(rows);
        } catch (requestError) {
            setMonitorError(getApiErrorInfo(requestError).message);
        } finally {
            setMonitorLoading(false);
        }
    }, []);

    const fetchDevices = useCallback(async () => {
        setDevicesLoading(true);
        setDevicesError('');
        try {
            const [devicesRes, shipsRes] = await Promise.all([InventoryService.getDevices({}), DefaultService.getShips({})]);
            const list = devicesRes.data ?? [];
            setDevices(list);
            const names: Record<string, string> = {};
            (shipsRes.data ?? []).forEach(s => { if (s.id) names[s.id] = s.name ?? s.code ?? s.id; });
            setShipNameById(names);
            setEdits(Object.fromEntries(list.filter(d => d.id).map(d => [d.id as string, { ipAddress: d.ip_address ?? '', saving: false, error: '' }])));
        } catch (requestError) {
            setDevicesError(getApiErrorInfo(requestError).message);
        } finally {
            setDevicesLoading(false);
        }
    }, []);

    const fetchSettings = useCallback(async () => {
        setSettingsError('');
        try {
            const res = await SettingsService.getSettings();
            setSettings(res.data);
        } catch (requestError) {
            setSettingsError(getApiErrorInfo(requestError).message);
        }
    }, []);

    // This effect synchronizes the page with the external API; its async callbacks own loading/error state.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchMonitoring(); void fetchDevices(); void fetchSettings(); }, [fetchMonitoring, fetchDevices, fetchSettings]);

    const saveDevice = useCallback(async (deviceId: string) => {
        const edit = edits[deviceId];
        if (!edit) return;
        setEdits(prev => ({ ...prev, [deviceId]: { ...prev[deviceId], saving: true, error: '' } }));
        try {
            const res = await InventoryService.patchDevices({
                deviceId,
                requestBody: { ip_address: edit.ipAddress.trim() || null },
            });
            setDevices(prev => prev.map(d => (d.id === deviceId ? res.data ?? d : d)));
            setEdits(prev => ({ ...prev, [deviceId]: { ...prev[deviceId], saving: false, savedAt: Date.now() } }));
        } catch (requestError) {
            setEdits(prev => ({ ...prev, [deviceId]: { ...prev[deviceId], saving: false, error: getApiErrorInfo(requestError).message } }));
        }
    }, [edits]);

    const revealSecret = useCallback(async (deviceId: string) => {
        setSecrets(prev => ({ ...prev, [deviceId]: { loading: true } }));
        try {
            const res = await InventoryService.getDevicesRadiusSecret({ deviceId });
            setSecrets(prev => ({ ...prev, [deviceId]: { loading: false, value: res.data?.secret } }));
        } catch (requestError) {
            setSecrets(prev => ({ ...prev, [deviceId]: { loading: false, error: getApiErrorInfo(requestError).message } }));
        }
    }, []);

    const hideSecret = useCallback((deviceId: string) => {
        setSecrets(prev => {
            const next = { ...prev };
            delete next[deviceId];
            return next;
        });
    }, []);

    const copy = useCallback(async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(''), 2000);
        } catch {
            setCopied('');
        }
    }, []);

    // Mỗi tàu chỉ có đúng 1 thiết bị (POST /devices chặn thiết bị thứ 2, v1.24.0) nên số phiên cấp
    // tàu gán thẳng được về thiết bị, không cần endpoint RADIUS riêng theo thiết bị.
    const sessionsByShipId = useMemo(() => {
        const map: Record<string, { active: number; total: number }> = {};
        shipRows.forEach(row => {
            if (!row.ship.id) return;
            const users = row.users?.data?.users ?? [];
            map[row.ship.id] = { active: users.filter(u => u.status === 'ACTIVE').length, total: users.length };
        });
        return map;
    }, [shipRows]);

    const scriptDevice = devices.find(d => d.id === scriptDeviceId);
    const scriptInput = {
        serverAddress: settings?.radius_server_address,
        authPort: settings?.radius_auth_port,
        acctPort: settings?.radius_acct_port,
        coaPort: settings?.radius_coa_port,
        secret: scriptDeviceId ? secrets[scriptDeviceId]?.value : undefined,
        nasIpAddress: scriptDevice?.ip_address,
        deviceName: scriptDevice?.name ?? scriptDevice?.code,
    };
    const scriptText = buildRouterOsRadiusScript(scriptInput);
    const scriptBlockers = routerOsRadiusBlockers(scriptInput);

    const totalActiveEndpoints = shipRows.reduce((sum, r) => sum + (r.health?.data?.healthy_endpoints ?? 0), 0);
    const shipsCompliant = shipRows.filter(r => r.health?.data?.ha_compliant).length;
    const devicesWithSecret = devices.filter(d => d.radius_secret_configured).length;
    const activeSessionsTotal = Object.values(sessionsByShipId).reduce((sum, s) => sum + s.active, 0);
    const serverConfigured = !!settings?.radius_server_address;

    return (
        <div>
            <div className="grid-cards" style={{ marginBottom: 20 }}>
                <MetricCard
                    icon={<RadioTower size={15} />}
                    title="Máy chủ RADIUS"
                    value={settings?.radius_server_address ?? null}
                    period="Cấu hình hiện tại"
                    source="Settings (RADIUS_SERVER_ADDRESS)"
                    freshness="Đọc từ .env"
                    status={serverConfigured ? 'healthy' : 'warning'}
                    description={`Access ${settings?.radius_auth_port ?? 1812} · Accounting ${settings?.radius_acct_port ?? 1813} · CoA ${settings?.radius_coa_port ?? 3799}`}
                />
                <MetricCard
                    icon={<KeyRound size={15} />}
                    title="NAS đã có secret"
                    value={`${devicesWithSecret} / ${devices.length}`}
                    period="Hiện tại"
                    source="devices.radius_secret_configured"
                    freshness="Trực tiếp từ DB"
                    status={devices.length > 0 && devicesWithSecret === devices.length ? 'healthy' : 'warning'}
                    description="Router chưa có secret sẽ bị server bỏ qua im lặng mọi gói Access-Request/Accounting-Request."
                />
                <MetricCard
                    icon={<Users size={15} />}
                    title="Phiên đang hoạt động"
                    value={activeSessionsTotal}
                    unit="phiên"
                    period="Hiện tại"
                    source="radius_sessions"
                    freshness="Trực tiếp từ DB"
                    status={activeSessionsTotal > 0 ? 'healthy' : 'unknown'}
                />
                <MetricCard
                    icon={<ShieldCheck size={15} />}
                    title="Tàu đạt RADIUS HA"
                    value={`${shipsCompliant} / ${ships.length}`}
                    period="Hiện tại"
                    source="crew/radius-health"
                    freshness="Trực tiếp từ DB"
                    status={ships.length > 0 && shipsCompliant === ships.length ? 'healthy' : 'warning'}
                    description={`${totalActiveEndpoints} endpoint khoẻ mạnh. HA yêu cầu tối thiểu 2 endpoint mỗi tàu.`}
                />
            </div>

            {settingsError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không đọc được cấu hình máy chủ RADIUS" description={settingsError} onRetry={() => void fetchSettings()} />}

            {!serverConfigured && !settingsError && (
                <div className="empty-state" style={{ textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d', marginBottom: 20 }}>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TriangleAlert size={15} color="var(--warning)" />Chưa đặt địa chỉ máy chủ RADIUS</strong>
                    <p style={{ marginTop: 4, marginBottom: 8 }}>Lệnh RouterOS sinh ra bên dưới sẽ thiếu <code>address=</code>. Đây là địa chỉ mà <em>router</em> kết nối tới (thường là IP ZeroTier của server), không phải địa chỉ backend tự lắng nghe.</p>
                    <Link to="/settings" className="button-secondary compact-button" style={{ textDecoration: 'none' }}>Mở Cài đặt → RADIUS →</Link>
                </div>
            )}

            {/* ---- NAS client ---- */}
            <section className="glass-panel dashboard-section">
                <div className="section-heading">
                    <div>
                        <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Server size={18} style={{ opacity: 0.75 }} />NAS client (router MikroTik)</h2>
                        <p>Mỗi thiết bị là một NAS. Server nhận diện NAS bằng <strong>địa chỉ nguồn</strong> của gói UDP, nên cột “IP router” phải khớp đúng IP mà router dùng để gửi gói RADIUS đi — sai IP thì gói bị bỏ im lặng, không có lỗi nào hiện ra.</p>
                    </div>
                    <button type="button" className="button-secondary compact-button" onClick={() => void fetchDevices()}>Làm mới</button>
                </div>

                {devicesError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách thiết bị" description={devicesError} onRetry={() => void fetchDevices()} />}

                {devicesLoading && devices.length === 0 ? (
                    <div className="loading-block"><div className="loading-spinner" /><span>Đang tải…</span></div>
                ) : (
                    <div className="table-shell">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Thiết bị</th>
                                    <th>Tàu</th>
                                    <th>IP router (NAS)</th>
                                    <th style={{ minWidth: 260 }}>Shared secret</th>
                                    <th>Lần cấp</th>
                                    <th style={{ textAlign: 'right' }}>Phiên</th>
                                    <th>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {devices.map(device => {
                                    const id = device.id as string;
                                    const edit = edits[id];
                                    const dirty = edit && edit.ipAddress !== (device.ip_address ?? '');
                                    const secret = secrets[id];
                                    const issued = formatLastSeen(device.radius_secret_issued_at);
                                    const sessions = device.ship_id ? sessionsByShipId[device.ship_id] : undefined;
                                    return (
                                        <tr key={id}>
                                            <td><strong>{device.name ?? device.code ?? id}</strong></td>
                                            <td>{device.ship_id ? shipNameById[device.ship_id] ?? device.ship_id : <span className="muted-text">Chưa gán tàu</span>}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <input type="text" value={edit?.ipAddress ?? ''} placeholder="vd 10.147.17.20" onChange={e => setEdits(prev => ({ ...prev, [id]: { ...prev[id], ipAddress: e.target.value } }))} style={monoInput} />
                                                    <button type="button" className="filter-apply" disabled={!dirty || edit?.saving} onClick={() => void saveDevice(id)}>{edit?.saving ? '…' : 'Lưu'}</button>
                                                </div>
                                                {edit?.error && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{edit.error}</div>}
                                                {!edit?.error && edit?.savedAt && <div style={{ color: 'var(--success)', fontSize: 11, marginTop: 4 }}>Đã lưu ✓</div>}
                                            </td>
                                            <td>
                                                {!device.radius_secret_configured ? (
                                                    <span className="status-dot warning">Chưa cấu hình</span>
                                                ) : secret?.value ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                        <code style={{ background: 'rgba(20, 108, 168, 0.08)', padding: '3px 7px', borderRadius: 5, fontSize: 12, wordBreak: 'break-all' }}>{secret.value}</code>
                                                        <button type="button" className="button-secondary compact-button" onClick={() => void copy(`secret-${id}`, secret.value as string)} title="Sao chép">{copied === `secret-${id}` ? <Check size={13} /> : <Copy size={13} />}</button>
                                                        <button type="button" className="button-secondary compact-button" onClick={() => hideSecret(id)} title="Ẩn lại"><EyeOff size={13} /></button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                        <span className="status-dot healthy">Đã cấu hình</span>
                                                        <button type="button" className="button-secondary compact-button" disabled={secret?.loading} onClick={() => void revealSecret(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Eye size={13} />{secret?.loading ? 'Đang lấy…' : 'Hiện secret'}</button>
                                                    </div>
                                                )}
                                                {secret?.error && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{secret.error}</div>}
                                            </td>
                                            <td><span className={issued.muted ? 'muted-text' : undefined} title={issued.title}>{device.radius_secret_issued_at ? issued.text : '—'}</span></td>
                                            <td style={{ textAlign: 'right' }}>{sessions ? `${sessions.active} / ${sessions.total}` : <span className="muted-text">—</span>}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    <button type="button" className="button-secondary compact-button" onClick={() => setScriptDeviceId(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Terminal size={13} />Sinh lệnh</button>
                                                    <Link to={`/devices/${id}`} className="button-secondary compact-button" style={{ textDecoration: 'none' }}>Chi tiết →</Link>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {devices.length === 0 && <div className="empty-state">Chưa có thiết bị nào.</div>}
                    </div>
                )}

                <p className="muted-text" style={{ fontSize: 12, marginTop: 10 }}>Mỗi lần bấm “Hiện secret” đều được ghi vào nhật ký kiểm toán (<code>device.radius_secret_reveal</code>). Đặt hoặc thu hồi secret làm ở trang chi tiết thiết bị.</p>
            </section>

            {/* ---- Sinh lệnh RouterOS ---- */}
            {scriptDeviceId && (
                <section className="glass-panel dashboard-section" style={{ marginTop: 20 }}>
                    <div className="section-heading">
                        <div>
                            <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Terminal size={18} style={{ opacity: 0.75 }} />Lệnh cấu hình cho {scriptDevice?.name ?? scriptDevice?.code ?? scriptDeviceId}</h2>
                            <p>Dán thẳng vào terminal RouterOS. Server không bao giờ tự chạy hộ — đây chỉ là văn bản.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="filter-apply" onClick={() => void copy('script', scriptText)}>{copied === 'script' ? 'Đã chép ✓' : 'Sao chép'}</button>
                            <button type="button" className="button-secondary compact-button" onClick={() => setScriptDeviceId('')}>Đóng</button>
                        </div>
                    </div>

                    {scriptBlockers.length > 0 && (
                        <div className="empty-state" style={{ textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', background: '#fffbeb', border: '1px solid #fcd34d' }}>
                            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TriangleAlert size={15} color="var(--warning)" />Lệnh còn chỗ trống</strong>
                            <p style={{ marginTop: 4, marginBottom: 0 }}>Còn thiếu: {scriptBlockers.join('; ')}. Dán lúc này router sẽ báo lỗi cú pháp ở đúng chỗ còn dấu ngoặc nhọn.</p>
                        </div>
                    )}

                    <pre style={{ background: '#0d3352', color: '#e2f1fb', padding: '14px 16px', borderRadius: 10, overflowX: 'auto', fontSize: 12, lineHeight: 1.65, marginTop: 12 }}>{scriptText}</pre>
                </section>
            )}

            {/* ---- Giám sát theo tàu ---- */}
            <section className="glass-panel dashboard-section" style={{ marginTop: 20 }}>
                <div className="section-heading">
                    <div><h2>Giám sát theo tàu</h2><p>Trạng thái HA, độ tươi accounting và độ phủ NetFlow/RADIUS — dữ liệu thật từ <code>/ships/{'{shipId}'}/crew/radius-health</code> và <code>/crew/users</code>.</p></div>
                    <button type="button" className="button-secondary compact-button" onClick={() => void fetchMonitoring()}>Làm mới</button>
                </div>
                {monitorError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được giám sát RADIUS" description={monitorError} onRetry={() => void fetchMonitoring()} />}
                {monitorLoading && shipRows.length === 0 ? (
                    <div className="loading-block"><div className="loading-spinner" /><span>Đang tải…</span></div>
                ) : (
                    <div className="table-shell">
                        <table className="data-table">
                            <thead><tr><th>Tàu</th><th>Trạng thái</th><th>Endpoint</th><th>HA</th><th>Độ tươi accounting</th><th>Phiên đang mở</th><th>Coverage NetFlow/RADIUS</th><th></th></tr></thead>
                            <tbody>
                                {shipRows.map(row => {
                                    const h = row.health?.data;
                                    const u = row.users?.data;
                                    const activeSessions = (u?.users ?? []).filter(user => user.status === 'ACTIVE').length;
                                    const coverage = u?.billing_reconciliation?.coverage_pct;
                                    return (
                                        <tr key={row.ship.id}>
                                            <td><strong>{row.ship.name ?? row.ship.code ?? row.ship.id}</strong></td>
                                            <td>{row.error ? <span className="status-dot critical">LỖI</span> : <span className={`status-dot ${radiusStatusClass(h?.status)}`}>{h?.status ?? 'UNKNOWN'}</span>}</td>
                                            <td>{formatCount(h?.healthy_endpoints)} / {formatCount(h?.configured_endpoints)} (tối thiểu {formatCount(h?.min_required_endpoints)})</td>
                                            <td>{h?.ha_compliant === undefined ? 'Không rõ' : h.ha_compliant ? 'Đạt' : 'Chưa đạt'}</td>
                                            <td>{h?.accounting_freshness_seconds === null || h?.accounting_freshness_seconds === undefined ? 'Chưa có dữ liệu' : `${h.accounting_freshness_seconds}s trước`}</td>
                                            <td>{u ? `${activeSessions} đang hoạt động / ${formatCount(u.users?.length)} tổng` : 'Không rõ'}</td>
                                            <td>{formatPercent(coverage)}</td>
                                            <td><Link to={`/ships?ship=${row.ship.id}`} className="button-secondary compact-button" style={{ textDecoration: 'none' }}>Mở tab CREW →</Link></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {shipRows.length === 0 && <div className="empty-state">Chưa có tàu nào.</div>}
                    </div>
                )}
            </section>
        </div>
    );
};
