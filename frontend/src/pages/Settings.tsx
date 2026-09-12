import React, { useCallback, useEffect, useState } from 'react';
import { DefaultService, ServiceEndpointsService, SettingsService } from '../api';
import { ServiceEndpoint } from '../api/models/ServiceEndpoint';
import { ServiceEndpointCreateRequest } from '../api/models/ServiceEndpointCreateRequest';
import type { SettingsResponse } from '../api/models/SettingsResponse';
import type { SettingsUpdateRequest } from '../api/models/SettingsUpdateRequest';
import { DataStateNotice } from '../components/DataStateNotice';
import { getApiErrorInfo, type MetricStatus } from '../lib/dashboard';

// service_type -> healthcheck_type mac dinh hop ly nhat, de form khong bat nguoi dung phai hieu
// het 10 gia tri enum healthcheck_type -- van sua duoc qua dropdown neu can khac.
const DEFAULT_HEALTHCHECK: Record<ServiceEndpoint.service_type, ServiceEndpointCreateRequest.healthcheck_type> = {
    RADIUS: ServiceEndpointCreateRequest.healthcheck_type.RADIUS_ACCESS_REQUEST,
    RADIUS_ACCT: ServiceEndpointCreateRequest.healthcheck_type.RADIUS_ACCT_PROBE,
    DATABASE: ServiceEndpointCreateRequest.healthcheck_type.SQL_RW,
    ZEROTIER: ServiceEndpointCreateRequest.healthcheck_type.HTTP_FUNCTIONAL,
    COLLECTOR: ServiceEndpointCreateRequest.healthcheck_type.FLOW_RECENCY,
    STORAGE: ServiceEndpointCreateRequest.healthcheck_type.S3_RW,
    USER_MANAGER: ServiceEndpointCreateRequest.healthcheck_type.HTTP_FUNCTIONAL,
    CONTROLLER: ServiceEndpointCreateRequest.healthcheck_type.HTTP_FUNCTIONAL,
    BUS: ServiceEndpointCreateRequest.healthcheck_type.NATS_RTT,
    CACHE: ServiceEndpointCreateRequest.healthcheck_type.HTTP_FUNCTIONAL,
};

const SERVICE_TYPES = Object.values(ServiceEndpoint.service_type);
const KNOWN_SERVICE_NAMES = ['radius.auth', 'radius.accounting', 'zerotier.controller', 'database.control'];

function statusClass(status?: string): MetricStatus {
    if (status === 'HEALTHY') return 'healthy';
    if (status === 'DEGRADED') return 'warning';
    if (status === 'UNHEALTHY') return 'critical';
    return 'unknown';
}

// ---------- ô nhập gọn: nhãn phía trên, ô nhập phía dưới ----------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div className="settings-field"><label>{label}</label>{children}</div>;
}

type DbForm = { host: string; port: string; database: string; username: string; password: string; reason: string };
type PortsForm = Record<string, string> & { reason: string };

const emptyAddForm = {
    service_name: '',
    service_type: ServiceEndpoint.service_type.DATABASE,
    host: '',
    port: '',
    protocol: 'tcp',
    priority: '100',
    secret_ref: '',
    enabled: true,
};

type EditForm = { host: string; port: string; protocol: string; priority: string; secret_ref: string; reason: string };

export const Settings: React.FC = () => {
    // Quyen: he thong chua co dang nhap/RBAC that (AuthStubGuard) -- ai dang nhap cung duoc stub
    // tra role "admin", nen kiem tra nay CHUA thuc su chan duoc ai khac hom nay. Van kiem tra dung
    // cho + hien ro gioi han, de khi co dang nhap/vai trò that se tu dung ngay.
    const [role, setRole] = useState<string>();
    const [roleLoading, setRoleLoading] = useState(true);
    const isSuperadmin = role === 'admin' || role === 'superadmin';
    const readOnly = !roleLoading && !isSuperadmin;

    // ---- 4 khoi cau hinh Tier-0 (.env, can restart) — moi khoi tu quan ly form/luu rieng ----
    const [current, setCurrent] = useState<SettingsResponse['data']>();
    const [coreLoading, setCoreLoading] = useState(true);
    const [coreError, setCoreError] = useState('');

    const [dbForm, setDbForm] = useState<DbForm>({ host: '', port: '', database: '', username: '', password: '', reason: '' });
    const [dbBusy, setDbBusy] = useState(false);
    const [dbMsg, setDbMsg] = useState<{ ok: boolean; text: string }>();

    const [radiusForm, setRadiusForm] = useState<PortsForm>({ radius_auth_port: '', radius_acct_port: '', reason: '' });
    const [radiusBusy, setRadiusBusy] = useState(false);
    const [radiusMsg, setRadiusMsg] = useState<{ ok: boolean; text: string }>();

    const [collectorForm, setCollectorForm] = useState<PortsForm>({ netflow_port: '', dns_log_port: '', reason: '' });
    const [collectorBusy, setCollectorBusy] = useState(false);
    const [collectorMsg, setCollectorMsg] = useState<{ ok: boolean; text: string }>();

    const [ztForm, setZtForm] = useState({ token: '', reason: '' });
    const [ztBusy, setZtBusy] = useState(false);
    const [ztMsg, setZtMsg] = useState<{ ok: boolean; text: string }>();

    // ---- endpoint giam sat khac (service_endpoints, ap dung ngay) ----
    const [endpoints, setEndpoints] = useState<ServiceEndpoint[]>([]);
    const [epLoading, setEpLoading] = useState(true);
    const [epError, setEpError] = useState('');
    const [actionId, setActionId] = useState('');
    const [addForm, setAddForm] = useState(emptyAddForm);
    const [addBusy, setAddBusy] = useState(false);
    const [addError, setAddError] = useState('');
    const [editingId, setEditingId] = useState('');
    const [editForm, setEditForm] = useState<EditForm>({ host: '', port: '', protocol: '', priority: '', secret_ref: '', reason: '' });
    const [editBusy, setEditBusy] = useState(false);
    const [editError, setEditError] = useState('');

    const fetchRole = useCallback(async () => {
        setRoleLoading(true);
        try {
            const res = await DefaultService.getAuthMe();
            setRole(res.data?.role);
        } catch {
            setRole(undefined);
        } finally {
            setRoleLoading(false);
        }
    }, []);

    const fetchCore = useCallback(async () => {
        setCoreLoading(true);
        setCoreError('');
        try {
            const res = await SettingsService.getSettings();
            const data = res.data;
            if (!data) return;
            setCurrent(data);
            setDbForm({ host: data.database?.host ?? '', port: data.database?.port ? String(data.database.port) : '', database: data.database?.database ?? '', username: data.database?.username ?? '', password: '', reason: '' });
            setRadiusForm({ radius_auth_port: data.radius_auth_port ? String(data.radius_auth_port) : '', radius_acct_port: data.radius_acct_port ? String(data.radius_acct_port) : '', reason: '' });
            setCollectorForm({ netflow_port: data.netflow_port ? String(data.netflow_port) : '', dns_log_port: data.dns_log_port ? String(data.dns_log_port) : '', reason: '' });
            setZtForm({ token: '', reason: '' });
        } catch (requestError) {
            setCoreError(getApiErrorInfo(requestError).message);
        } finally {
            setCoreLoading(false);
        }
    }, []);

    const fetchEndpoints = useCallback(async () => {
        setEpLoading(true);
        setEpError('');
        try {
            const res = await ServiceEndpointsService.getServiceEndpoints({});
            setEndpoints(res.data ?? []);
        } catch (requestError) {
            setEpError(getApiErrorInfo(requestError).message);
        } finally {
            setEpLoading(false);
        }
    }, []);

    useEffect(() => { void fetchRole(); void fetchCore(); void fetchEndpoints(); }, [fetchRole, fetchCore, fetchEndpoints]);

    // Goi chung 1 API cho ca 4 khoi (backend gop chung /settings), nhung moi khoi tu goi rieng chi
    // voi phan cua minh -- ro rang "bam Lưu ở đây chỉ đổi đúng khối này".
    async function patchAndReport(
        body: SettingsUpdateRequest,
        setBusy: (v: boolean) => void,
        setMsg: (v: { ok: boolean; text: string } | undefined) => void,
        onSuccessResetSecret?: () => void,
    ) {
        if (body.reason.trim().length < 3) {
            setMsg({ ok: false, text: 'Lý do thay đổi cần ít nhất 3 ký tự.' });
            return;
        }
        setBusy(true);
        setMsg(undefined);
        try {
            const res = await SettingsService.patchSettings({ requestBody: body });
            setCurrent(res.data);
            const restartRequired = !!(res.data as { restart_required?: boolean } | undefined)?.restart_required;
            setMsg({ ok: true, text: restartRequired ? 'Đã lưu — cần khởi động lại backend để áp dụng.' : 'Đã lưu.' });
            onSuccessResetSecret?.();
        } catch (requestError) {
            setMsg({ ok: false, text: getApiErrorInfo(requestError).message });
        } finally {
            setBusy(false);
        }
    }

    const saveDatabase = (e: React.FormEvent) => {
        e.preventDefault();
        void patchAndReport(
            {
                database: {
                    ...(dbForm.host ? { host: dbForm.host } : {}),
                    ...(dbForm.port ? { port: Number(dbForm.port) } : {}),
                    ...(dbForm.database ? { database: dbForm.database } : {}),
                    ...(dbForm.username ? { username: dbForm.username } : {}),
                    ...(dbForm.password ? { password: dbForm.password } : {}),
                },
                reason: dbForm.reason,
            },
            setDbBusy, setDbMsg,
            () => setDbForm(f => ({ ...f, password: '', reason: '' })),
        );
    };

    const saveRadius = (e: React.FormEvent) => {
        e.preventDefault();
        void patchAndReport(
            {
                ...(radiusForm.radius_auth_port ? { radius_auth_port: Number(radiusForm.radius_auth_port) } : {}),
                ...(radiusForm.radius_acct_port ? { radius_acct_port: Number(radiusForm.radius_acct_port) } : {}),
                reason: radiusForm.reason,
            },
            setRadiusBusy, setRadiusMsg,
            () => setRadiusForm(f => ({ ...f, reason: '' })),
        );
    };

    const saveCollectors = (e: React.FormEvent) => {
        e.preventDefault();
        void patchAndReport(
            {
                ...(collectorForm.netflow_port ? { netflow_port: Number(collectorForm.netflow_port) } : {}),
                ...(collectorForm.dns_log_port ? { dns_log_port: Number(collectorForm.dns_log_port) } : {}),
                reason: collectorForm.reason,
            },
            setCollectorBusy, setCollectorMsg,
            () => setCollectorForm(f => ({ ...f, reason: '' })),
        );
    };

    const saveZerotier = (e: React.FormEvent) => {
        e.preventDefault();
        void patchAndReport(
            { ...(ztForm.token ? { zerotier_controller_token: ztForm.token } : {}), reason: ztForm.reason },
            setZtBusy, setZtMsg,
            () => setZtForm({ token: '', reason: '' }),
        );
    };

    const createEndpoint = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddBusy(true);
        setAddError('');
        try {
            await ServiceEndpointsService.postServicesEndpoints({
                serviceName: addForm.service_name,
                requestBody: {
                    service_type: addForm.service_type,
                    host: addForm.host,
                    port: Number(addForm.port),
                    protocol: addForm.protocol,
                    priority: Number(addForm.priority) || 100,
                    healthcheck_type: DEFAULT_HEALTHCHECK[addForm.service_type],
                    secret_ref: addForm.secret_ref || null,
                    enabled: addForm.enabled,
                },
            });
            setAddForm(emptyAddForm);
            await fetchEndpoints();
        } catch (requestError) {
            setAddError(getApiErrorInfo(requestError).message);
        } finally {
            setAddBusy(false);
        }
    };

    const startEdit = (ep: ServiceEndpoint) => {
        setEditingId(ep.id ?? '');
        setEditForm({ host: ep.host ?? '', port: String(ep.port ?? ''), protocol: ep.protocol ?? '', priority: String(ep.priority ?? 100), secret_ref: '', reason: '' });
        setEditError('');
    };

    const cancelEdit = () => { setEditingId(''); setEditError(''); };

    const saveEdit = async (id: string) => {
        if (editForm.reason.trim().length < 3) {
            setEditError('Lý do thay đổi cần ít nhất 3 ký tự.');
            return;
        }
        setEditBusy(true);
        setEditError('');
        try {
            await ServiceEndpointsService.patchServiceEndpoints({
                id,
                requestBody: {
                    host: editForm.host,
                    port: Number(editForm.port),
                    protocol: editForm.protocol,
                    priority: Number(editForm.priority) || 100,
                    ...(editForm.secret_ref.trim() ? { secret_ref: editForm.secret_ref.trim() } : {}),
                    reason: editForm.reason,
                },
            });
            setEditingId('');
            await fetchEndpoints();
        } catch (requestError) {
            setEditError(getApiErrorInfo(requestError).message);
        } finally {
            setEditBusy(false);
        }
    };

    const removeEndpoint = async (id: string) => {
        if (!id || !window.confirm('Xoá endpoint này?')) return;
        setActionId(id);
        try {
            await ServiceEndpointsService.deleteServiceEndpoints({ id });
            await fetchEndpoints();
        } catch (requestError) {
            setEpError(getApiErrorInfo(requestError).message);
        } finally {
            setActionId('');
        }
    };

    const runAction = async (id: string, action: 'check' | 'enable' | 'disable') => {
        if (!id) return;
        setActionId(id);
        try {
            if (action === 'check') await ServiceEndpointsService.postServiceEndpointsCheck({ id });
            if (action === 'enable') await ServiceEndpointsService.postServiceEndpointsEnable({ id });
            if (action === 'disable') await ServiceEndpointsService.postServiceEndpointsDisable({ id });
            await fetchEndpoints();
        } catch (requestError) {
            setEpError(getApiErrorInfo(requestError).message);
        } finally {
            setActionId('');
        }
    };

    return (
        <div>
            {!roleLoading && !isSuperadmin && (
                <DataStateNotice
                    dataStatus="UNAVAILABLE"
                    title="Chỉ Superadmin được sửa Cài đặt"
                    description={`Tài khoản hiện tại có vai trò "${role ?? 'không rõ'}" — mọi ô nhập bên dưới bị khoá (chỉ xem). Hệ thống chưa có đăng nhập/phân quyền thật nên hạn chế này chưa chặn được người khác trên cùng máy.`}
                />
            )}
            {coreError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được cấu hình" description={coreError} onRetry={() => void fetchCore()} />}

            {coreLoading && !current ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải…</span></div>
            ) : (
                <div className="settings-card-grid">
                    {/* ---- Database ---- */}
                    <section className="glass-panel dashboard-section">
                        <div className="section-heading"><div><h2>Cơ sở dữ liệu</h2></div></div>
                        <div className="settings-current">
                            Hiện tại: <strong>{current?.database?.host ?? 'chưa rõ'}:{current?.database?.port ?? '—'}</strong> / {current?.database?.database ?? '—'} · user {current?.database?.username ?? '—'} · mật khẩu {current?.database?.password_configured ? 'đã cấu hình' : 'chưa có'}
                        </div>
                        <form onSubmit={saveDatabase}>
                            <div className="settings-field-grid">
                                <Field label="Host"><input disabled={readOnly} value={dbForm.host} onChange={e => setDbForm({ ...dbForm, host: e.target.value })} /></Field>
                                <Field label="Port"><input type="number" disabled={readOnly} value={dbForm.port} onChange={e => setDbForm({ ...dbForm, port: e.target.value })} /></Field>
                                <Field label="Database"><input disabled={readOnly} value={dbForm.database} onChange={e => setDbForm({ ...dbForm, database: e.target.value })} /></Field>
                                <Field label="Username"><input disabled={readOnly} value={dbForm.username} onChange={e => setDbForm({ ...dbForm, username: e.target.value })} /></Field>
                                <Field label="Mật khẩu"><input type="password" disabled={readOnly} placeholder="giữ nguyên nếu để trống" value={dbForm.password} onChange={e => setDbForm({ ...dbForm, password: e.target.value })} /></Field>
                            </div>
                            <div className="settings-footer">
                                <Field label="Lý do thay đổi"><input required minLength={3} disabled={readOnly} value={dbForm.reason} onChange={e => setDbForm({ ...dbForm, reason: e.target.value })} /></Field>
                                <button type="submit" className="filter-apply" disabled={readOnly || dbBusy}>{dbBusy ? 'Đang lưu…' : 'Lưu'}</button>
                            </div>
                            {dbMsg && <p style={{ color: dbMsg.ok ? 'var(--success)' : '#dc2626', fontSize: 12, marginTop: 8 }}>{dbMsg.text}</p>}
                        </form>
                    </section>

                    {/* ---- RADIUS ---- */}
                    <section className="glass-panel dashboard-section">
                        <div className="section-heading"><div><h2>RADIUS</h2></div></div>
                        <div className="settings-current">Hiện tại: Access <strong>{current?.radius_auth_port ?? '—'}</strong> · Accounting <strong>{current?.radius_acct_port ?? '—'}</strong></div>
                        <form onSubmit={saveRadius}>
                            <div className="settings-field-grid">
                                <Field label="Access port"><input type="number" disabled={readOnly} value={radiusForm.radius_auth_port} onChange={e => setRadiusForm({ ...radiusForm, radius_auth_port: e.target.value })} /></Field>
                                <Field label="Accounting port"><input type="number" disabled={readOnly} value={radiusForm.radius_acct_port} onChange={e => setRadiusForm({ ...radiusForm, radius_acct_port: e.target.value })} /></Field>
                            </div>
                            <div className="settings-footer">
                                <Field label="Lý do thay đổi"><input required minLength={3} disabled={readOnly} value={radiusForm.reason} onChange={e => setRadiusForm({ ...radiusForm, reason: e.target.value })} /></Field>
                                <button type="submit" className="filter-apply" disabled={readOnly || radiusBusy}>{radiusBusy ? 'Đang lưu…' : 'Lưu'}</button>
                            </div>
                            {radiusMsg && <p style={{ color: radiusMsg.ok ? 'var(--success)' : '#dc2626', fontSize: 12, marginTop: 8 }}>{radiusMsg.text}</p>}
                        </form>
                    </section>

                    {/* ---- NetFlow & DNS ---- */}
                    <section className="glass-panel dashboard-section">
                        <div className="section-heading"><div><h2>NetFlow &amp; DNS</h2></div></div>
                        <div className="settings-current">Hiện tại: NetFlow <strong>{current?.netflow_port ?? '—'}</strong> · DNS log <strong>{current?.dns_log_port ?? '—'}</strong></div>
                        <form onSubmit={saveCollectors}>
                            <div className="settings-field-grid">
                                <Field label="NetFlow port"><input type="number" disabled={readOnly} value={collectorForm.netflow_port} onChange={e => setCollectorForm({ ...collectorForm, netflow_port: e.target.value })} /></Field>
                                <Field label="DNS log port"><input type="number" disabled={readOnly} value={collectorForm.dns_log_port} onChange={e => setCollectorForm({ ...collectorForm, dns_log_port: e.target.value })} /></Field>
                            </div>
                            <div className="settings-footer">
                                <Field label="Lý do thay đổi"><input required minLength={3} disabled={readOnly} value={collectorForm.reason} onChange={e => setCollectorForm({ ...collectorForm, reason: e.target.value })} /></Field>
                                <button type="submit" className="filter-apply" disabled={readOnly || collectorBusy}>{collectorBusy ? 'Đang lưu…' : 'Lưu'}</button>
                            </div>
                            {collectorMsg && <p style={{ color: collectorMsg.ok ? 'var(--success)' : '#dc2626', fontSize: 12, marginTop: 8 }}>{collectorMsg.text}</p>}
                        </form>
                    </section>

                    {/* ---- ZeroTier ---- */}
                    <section className="glass-panel dashboard-section">
                        <div className="section-heading"><div><h2>ZeroTier</h2></div></div>
                        <div className="settings-current">Token controller: <strong>{current?.zerotier_controller_token_configured ? 'đã cấu hình' : 'chưa có'}</strong></div>
                        <form onSubmit={saveZerotier}>
                            <div className="settings-field-grid">
                                <Field label="Controller token"><input type="password" disabled={readOnly} placeholder="giữ nguyên nếu để trống" value={ztForm.token} onChange={e => setZtForm({ ...ztForm, token: e.target.value })} /></Field>
                            </div>
                            <div className="settings-footer">
                                <Field label="Lý do thay đổi"><input required minLength={3} disabled={readOnly} value={ztForm.reason} onChange={e => setZtForm({ ...ztForm, reason: e.target.value })} /></Field>
                                <button type="submit" className="filter-apply" disabled={readOnly || ztBusy}>{ztBusy ? 'Đang lưu…' : 'Lưu'}</button>
                            </div>
                            {ztMsg && <p style={{ color: ztMsg.ok ? 'var(--success)' : '#dc2626', fontSize: 12, marginTop: 8 }}>{ztMsg.text}</p>}
                        </form>
                    </section>
                </div>
            )}

            {/* ---- Endpoint giám sát khác (nâng cao) ---- */}
            <div className="top-bar" style={{ marginTop: 8 }}>
                <div><h2 style={{ margin: 0 }}>Endpoint giám sát khác</h2><p className="page-subtitle">RADIUS HA, ZeroTier controller... — áp dụng ngay, không cần restart.</p></div>
            </div>

            <section className="glass-panel dashboard-section">
                <form onSubmit={createEndpoint}>
                    <div className="settings-field-grid">
                        <Field label="Service name">
                            <input list="known-service-names" required disabled={readOnly} value={addForm.service_name} onChange={e => setAddForm({ ...addForm, service_name: e.target.value })} placeholder="vd: radius.auth" />
                            <datalist id="known-service-names">{KNOWN_SERVICE_NAMES.map(n => <option key={n} value={n} />)}</datalist>
                        </Field>
                        <Field label="Loại">
                            <select disabled={readOnly} value={addForm.service_type} onChange={e => setAddForm({ ...addForm, service_type: e.target.value as ServiceEndpoint.service_type })}>
                                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </Field>
                        <Field label="Host"><input required disabled={readOnly} value={addForm.host} onChange={e => setAddForm({ ...addForm, host: e.target.value })} placeholder="vd: 10.149.79.186" /></Field>
                        <Field label="Port"><input type="number" min={1} max={65535} required disabled={readOnly} value={addForm.port} onChange={e => setAddForm({ ...addForm, port: e.target.value })} /></Field>
                        <Field label="Giao thức"><input required disabled={readOnly} value={addForm.protocol} onChange={e => setAddForm({ ...addForm, protocol: e.target.value })} /></Field>
                        <Field label="Ưu tiên"><input type="number" disabled={readOnly} value={addForm.priority} onChange={e => setAddForm({ ...addForm, priority: e.target.value })} /></Field>
                        <Field label="Secret ref"><input disabled={readOnly} value={addForm.secret_ref} onChange={e => setAddForm({ ...addForm, secret_ref: e.target.value })} placeholder="env:TÊN_BIẾN" /></Field>
                        <Field label="Bật"><input type="checkbox" style={{ width: 18, height: 18 }} disabled={readOnly} checked={addForm.enabled} onChange={e => setAddForm({ ...addForm, enabled: e.target.checked })} /></Field>
                    </div>
                    <button type="submit" className="filter-apply" disabled={readOnly || addBusy}>{addBusy ? 'Đang thêm…' : '+ Thêm endpoint'}</button>
                </form>
                {addError && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{addError}</p>}
            </section>

            {epError && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được service registry" description={epError} onRetry={() => void fetchEndpoints()} />}

            {epLoading && endpoints.length === 0 ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải…</span></div>
            ) : !epError && endpoints.length === 0 ? (
                <div className="empty-state">Chưa có endpoint nào được khai báo.</div>
            ) : endpoints.length > 0 ? (
                <section className="glass-panel dashboard-section">
                    <div className="table-shell">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Service</th><th>Loại</th><th>Host</th><th>Port</th><th>Giao thức</th><th>Ưu tiên</th><th>Secret ref</th><th>Trạng thái</th><th>Bật</th><th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {endpoints.map(ep => {
                                    const isEditing = editingId === ep.id;
                                    return (
                                        <tr key={ep.id}>
                                            <td><strong>{ep.service_name ?? 'Không rõ'}</strong></td>
                                            <td>{ep.service_type ?? 'UNKNOWN'}</td>
                                            <td>{isEditing ? <input className="filter-select" value={editForm.host} onChange={e => setEditForm({ ...editForm, host: e.target.value })} /> : (ep.host ?? 'Không rõ')}</td>
                                            <td>{isEditing ? <input className="filter-select" type="number" style={{ width: 80 }} value={editForm.port} onChange={e => setEditForm({ ...editForm, port: e.target.value })} /> : (ep.port ?? '—')}</td>
                                            <td>{isEditing ? <input className="filter-select" style={{ width: 80 }} value={editForm.protocol} onChange={e => setEditForm({ ...editForm, protocol: e.target.value })} /> : (ep.protocol ?? '')}</td>
                                            <td>{isEditing ? <input className="filter-select" type="number" style={{ width: 70 }} value={editForm.priority} onChange={e => setEditForm({ ...editForm, priority: e.target.value })} /> : (ep.priority ?? '—')}</td>
                                            <td>{isEditing ? <input className="filter-select" style={{ width: 130 }} placeholder="giữ nguyên nếu để trống" value={editForm.secret_ref} onChange={e => setEditForm({ ...editForm, secret_ref: e.target.value })} /> : (ep.secret_configured ? 'Đã cấu hình' : 'Chưa có')}</td>
                                            <td>
                                                <span className={`status-dot ${statusClass(ep.status)}`}>{ep.status ?? 'UNKNOWN'}</span>
                                                {ep.in_maintenance && <span className="state-badge badge-warning" style={{ marginLeft: 6 }}>MAINTENANCE</span>}
                                            </td>
                                            <td>{ep.enabled ? 'Có' : 'Không'}</td>
                                            <td>
                                                {readOnly ? null : isEditing ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                                                        <input className="filter-select" required minLength={3} placeholder="Lý do thay đổi" value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} />
                                                        {editError && <span style={{ color: '#dc2626', fontSize: 11 }}>{editError}</span>}
                                                        <div style={{ display: 'flex', gap: 6 }}>
                                                            <button type="button" className="filter-apply" disabled={editBusy} onClick={() => void saveEdit(ep.id ?? '')}>Lưu</button>
                                                            <button type="button" className="button-secondary compact-button" disabled={editBusy} onClick={cancelEdit}>Huỷ</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        <button type="button" className="button-secondary compact-button" disabled={actionId === ep.id} onClick={() => startEdit(ep)}>Sửa</button>
                                                        <button type="button" className="button-secondary compact-button" disabled={actionId === ep.id} onClick={() => void runAction(ep.id ?? '', 'check')}>Check</button>
                                                        {ep.enabled
                                                            ? <button type="button" className="button-secondary compact-button" disabled={actionId === ep.id} onClick={() => void runAction(ep.id ?? '', 'disable')}>Tắt</button>
                                                            : <button type="button" className="button-secondary compact-button" disabled={actionId === ep.id} onClick={() => void runAction(ep.id ?? '', 'enable')}>Bật</button>}
                                                        <button type="button" className="button-secondary compact-button" disabled={actionId === ep.id} onClick={() => void removeEndpoint(ep.id ?? '')}>Xoá</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}
        </div>
    );
};
