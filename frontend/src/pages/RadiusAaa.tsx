import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CrewService, DefaultService, InventoryService } from '../api';
import type { CrewRadiusHealthResponse } from '../api/models/CrewRadiusHealthResponse';
import type { CrewUsersResponse } from '../api/models/CrewUsersResponse';
import type { Device } from '../api/models/Device';
import type { ShipItem } from '../api/models/ShipItem';
import { DataStateNotice } from '../components/DataStateNotice';
import { MetricCard } from '../components/MetricCard';
import { formatCount, formatPercent, getApiErrorInfo, type MetricStatus } from '../lib/dashboard';

function radiusStatusClass(status?: string): MetricStatus {
    if (status === 'HEALTHY') return 'healthy';
    if (status === 'DEGRADED') return 'warning';
    if (status === 'UNHEALTHY') return 'critical';
    return 'unknown';
}

type ShipRadiusRow = { ship: ShipItem; health?: CrewRadiusHealthResponse; users?: CrewUsersResponse; error?: string };
type DeviceEditState = { ipAddress: string; saving: boolean; error: string; savedAt?: number };

/**
 * RADIUS / AAA — thay cho ServiceEndpointsTable cũ (bảng đó lọc service_endpoints loại RADIUS/
 * RADIUS_ACCT/USER_MANAGER, nhưng bảng đó trống — kiến trúc RADIUS thật của hệ thống này giờ là
 * cả Access-Request (PAP, RFC 2865) lẫn Accounting (RFC 2866), chạy ngay trong backend
 * (radius-server/), không đăng ký qua ServiceRegistry). Trang này ghép 2 việc thật: GIÁM SÁT
 * (radius-health + số phiên theo từng tàu, dữ liệu thật từ GET /ships/{shipId}/crew/radius-health
 * + /crew/users) và CẤU HÌNH NHANH IP router theo từng thiết bị (PATCH /devices/{deviceId}).
 * Secret RADIUS (credential_ref) KHÔNG còn sửa tay ở đây được nữa — gõ sai (vd thiếu tiền tố
 * "env:") sẽ âm thầm làm rớt mọi gói UDP thật của thiết bị đó mà không có lỗi rõ ràng nào (đã xảy
 * ra thật với thiết bị "test detail"). Cấp/thu hồi secret thật giờ chỉ có ở trang chi tiết thiết bị
 * (DeviceDetail.tsx), dùng đúng luồng sinh ngẫu nhiên + hiện 1 lần đã dùng cho push-key.
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

    // This effect synchronizes the page with the external API; its async callbacks own loading/error state.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchMonitoring(); void fetchDevices(); }, [fetchMonitoring, fetchDevices]);

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

    const totalActiveEndpoints = shipRows.reduce((sum, r) => sum + (r.health?.data?.healthy_endpoints ?? 0), 0);
    const shipsCompliant = shipRows.filter(r => r.health?.data?.ha_compliant).length;
    const shipsWithSecret = devices.filter(d => d.radius_secret_configured).length;

    return (
        <div>
            <div className="grid-cards" style={{ marginBottom: 20 }}>
                <MetricCard title="Tàu có RADIUS đạt HA" value={`${shipsCompliant} / ${ships.length}`} period="Hiện tại" source="crew/radius-health" freshness="Trực tiếp từ DB" status={ships.length > 0 && shipsCompliant === ships.length ? 'healthy' : 'warning'} description="HA yêu cầu tối thiểu 2 endpoint radius.auth+radius.accounting mỗi tàu." />
                <MetricCard title="Endpoint RADIUS khoẻ mạnh" value={totalActiveEndpoints} unit="endpoint" period="Hiện tại" source="service_registry+telemetry" freshness="Trực tiếp từ DB" status="healthy" />
                <MetricCard title="Thiết bị đã cấu hình secret" value={`${shipsWithSecret} / ${devices.length}`} period="Hiện tại" source="devices.radius_secret_configured" freshness="Trực tiếp từ DB" status={devices.length > 0 && shipsWithSecret === devices.length ? 'healthy' : 'warning'} description="Thiết bị chưa có secret sẽ không xác thực được RADIUS Access-Request/Accounting-Request thật." />
            </div>

            <section className="glass-panel dashboard-section">
                <div className="section-heading"><div><h2>Giám sát theo tàu</h2><p>Trạng thái RADIUS HA, độ tươi accounting và số phiên/độ phủ NetFlow — dữ liệu thật từ GET /ships/{'{shipId}'}/crew/radius-health + /crew/users.</p></div><button type="button" className="button-secondary compact-button" onClick={() => void fetchMonitoring()}>Làm mới</button></div>
                {monitorError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được giám sát RADIUS" description={monitorError} onRetry={() => void fetchMonitoring()} />}
                {monitorLoading && shipRows.length === 0 ? (
                    <div className="loading-block"><div className="loading-spinner" /><span>Đang tải...</span></div>
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
                                            <td><strong>{row.ship.name ?? row.ship.code ?? row.ship.id}</strong><div className="muted-text">{row.ship.code}</div></td>
                                            <td>{row.error ? <span className="status-dot critical">LỖI</span> : <span className={`status-dot ${radiusStatusClass(h?.status)}`}>{h?.status ?? 'UNKNOWN'}</span>}</td>
                                            <td>{formatCount(h?.healthy_endpoints)} / {formatCount(h?.configured_endpoints)} (tối thiểu {formatCount(h?.min_required_endpoints)})</td>
                                            <td>{h?.ha_compliant === undefined ? 'Không rõ' : h.ha_compliant ? 'Đạt' : 'Chưa đạt'}</td>
                                            <td>{h?.accounting_freshness_seconds === null || h?.accounting_freshness_seconds === undefined ? 'Chưa có dữ liệu' : `${h.accounting_freshness_seconds}s trước`}</td>
                                            <td>{u ? `${activeSessions} đang hoạt động / ${formatCount(u.users?.length)} tổng` : 'Không rõ'}</td>
                                            <td>{formatPercent(coverage)}</td>
                                            <td><Link to={`/ships?ship=${row.ship.id}`} className="button-secondary compact-button">Mở tab CREW →</Link></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {shipRows.length === 0 && <div className="empty-state">Chưa có tàu nào.</div>}
                    </div>
                )}
            </section>

            <section className="glass-panel dashboard-section" style={{ marginTop: 20 }}>
                <div className="section-heading"><div><h2>Cấu hình theo thiết bị</h2><p>IP router (server dùng để nhận diện gói UDP thật) sửa nhanh tại đây. Cấp/thu hồi secret RADIUS thật (không gõ tay được nữa — dễ gõ sai <code>env:TÊN_BIẾN</code> khiến gói bị âm thầm rớt) làm ở trang chi tiết thiết bị.</p></div><button type="button" className="button-secondary compact-button" onClick={() => void fetchDevices()}>Làm mới</button></div>
                {devicesError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách thiết bị" description={devicesError} onRetry={() => void fetchDevices()} />}
                {devicesLoading && devices.length === 0 ? (
                    <div className="loading-block"><div className="loading-spinner" /><span>Đang tải...</span></div>
                ) : (
                    <div className="table-shell">
                        <table className="data-table">
                            <thead><tr><th>Thiết bị</th><th>Tàu</th><th>IP router</th><th>Secret RADIUS</th><th></th><th></th></tr></thead>
                            <tbody>
                                {devices.map(device => {
                                    const id = device.id as string;
                                    const edit = edits[id];
                                    const dirty = edit && edit.ipAddress !== (device.ip_address ?? '');
                                    return (
                                        <tr key={id}>
                                            <td><strong>{device.name ?? device.code ?? id}</strong><div className="muted-text">{device.code}</div></td>
                                            <td>{device.ship_id ? shipNameById[device.ship_id] ?? device.ship_id : 'Chưa gán tàu'}</td>
                                            <td><input type="text" value={edit?.ipAddress ?? ''} placeholder="vd: 192.168.88.1" onChange={e => setEdits(prev => ({ ...prev, [id]: { ...prev[id], ipAddress: e.target.value } }))} style={{ width: 150, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: 12 }} /></td>
                                            <td><span className={`status-dot ${device.radius_secret_configured ? 'healthy' : 'warning'}`}>{device.radius_secret_configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</span></td>
                                            <td>
                                                <button type="button" className="filter-apply" disabled={!dirty || edit?.saving} onClick={() => void saveDevice(id)}>{edit?.saving ? 'Đang lưu…' : 'Lưu IP'}</button>
                                                {edit?.error && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{edit.error}</div>}
                                                {!edit?.error && edit?.savedAt && <div style={{ color: '#16a34a', fontSize: 11, marginTop: 4 }}>Đã lưu ✓</div>}
                                            </td>
                                            <td><Link to={`/devices/${id}`} className="button-secondary compact-button">Chi tiết / secret →</Link></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {devices.length === 0 && <div className="empty-state">Chưa có thiết bị nào.</div>}
                    </div>
                )}
            </section>
        </div>
    );
};
