import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users as UsersIcon, Wifi, UserX, BarChart3, RefreshCw, Upload, Download, Eye, Lock, Unlock, Trash2 } from 'lucide-react';
import { InventoryService, PackagesService, SubscribersService, TenantsService } from '../api';
import { Subscriber } from '../api/models/Subscriber';
import type { Package } from '../api/models/Package';
import type { Device } from '../api/models/Device';
import type { Tenant } from '../api/models/Tenant';
import { DataStateNotice } from '../components/DataStateNotice';
import { formatBytes, formatCount, getApiErrorInfo } from '../lib/dashboard';

type Tab = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'ALL';

const emptyCreateForm = {
    tenant_id: '',
    username: '',
    password: '',
    display_name: '',
    auth_type: Subscriber.auth_type.PPPOE,
    package_id: '',
    nas_device_id: '',
    expires_at: '',
};

function KpiCard({ icon, iconBg, label, value }: { icon: React.ReactNode; iconBg: string; label: string; value: React.ReactNode }) {
    return (
        <div style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 4px rgba(0,0,0,0.02)', flex: '1 1 200px' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{value}</span>
            </div>
        </div>
    );
}

function IconAction({ title, tone, disabled, onClick, children }: { title: string; tone: 'blue' | 'amber' | 'red'; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    const palette = { blue: { bg: '#eff6ff', color: '#2563eb' }, amber: { bg: '#fffbeb', color: '#b45309' }, red: { bg: '#fef2f2', color: '#dc2626' } }[tone];
    return (
        <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} style={{ width: 30, height: 30, borderRadius: '50%', background: palette.bg, color: palette.color, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
            {children}
        </button>
    );
}

export const Users: React.FC = () => {
    const navigate = useNavigate();
    const [tab, setTab] = useState<Tab>('ALL');
    const [tenantFilter, setTenantFilter] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    // Danh sach KHONG loc theo tab (van loc theo search+tenant) -- dung rieng de tinh KPI tong quan
    // (Hoat dong/Tam khoa/Het han) khong bi bop theo tab dang xem, tach voi `subscribers` (list bang).
    const [allForKpi, setAllForKpi] = useState<Subscriber[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState(emptyCreateForm);
    const [createError, setCreateError] = useState('');
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);
    const [bulkError, setBulkError] = useState('');

    // Go 1 ky tu -> doi 350ms khong go them nua moi thuc su fetch -- truoc day search rang buoc
    // truc tiep vao dependency cua fetchData nen MOI ky tu goi 1 request rieng (khong debounce).
    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput), 350);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [subRes, kpiRes, pkgRes, devRes, tenantRes] = await Promise.all([
                SubscribersService.getSubscribers({ status: tab === 'ALL' ? undefined : tab, tenantId: tenantFilter || undefined, q: search || undefined }),
                SubscribersService.getSubscribers({ tenantId: tenantFilter || undefined, q: search || undefined }),
                PackagesService.getPackages({}),
                InventoryService.getDevices({}),
                TenantsService.getTenants({}),
            ]);
            setSubscribers(subRes.data ?? []);
            setAllForKpi(kpiRes.data ?? []);
            setPackages(pkgRes.data ?? []);
            setDevices(devRes.data ?? []);
            setTenants(tenantRes.data ?? []);
            setSelectedIds(new Set());
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setLoading(false);
        }
    }, [tab, tenantFilter, search]);

    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchData(); }, [fetchData]);

    const packageName = (id?: string | null) => packages.find(p => p.id === id)?.name ?? 'Không rõ';
    const tenantName = (id?: string | null) => tenants.find(t => t.id === id)?.name ?? 'Không rõ';
    const deviceName = (id?: string | null) => devices.find(d => d.id === id)?.name ?? 'Chưa gán';
    const quotaOf = (id?: string | null) => packages.find(p => p.id === id)?.quota_gb ?? 0;

    const kpiTotal = allForKpi.length;
    const kpiActive = allForKpi.filter(s => s.status === 'ACTIVE').length;
    const kpiExpired = allForKpi.filter(s => s.status === 'EXPIRED').length;
    const kpiTrafficBytes = allForKpi.reduce((sum, s) => sum + (s.quota_used_bytes ?? 0), 0);

    const createSubscriber = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setCreateError('');
        try {
            // Admin tu go mat khau THAT ngay trong form nay (bo tinh nang tu sinh mat khau ngau
            // nhien theo yeu cau) -- server chi luu ban bam, khong tra lai plaintext qua bat ky
            // response nao nua nen khong can man hinh "hien mat khau 1 lan" sau khi tao xong.
            await SubscribersService.postSubscribers({
                requestBody: {
                    tenant_id: createForm.tenant_id,
                    username: createForm.username,
                    password: createForm.password,
                    display_name: createForm.display_name || null,
                    auth_type: createForm.auth_type,
                    package_id: createForm.package_id,
                    nas_device_id: createForm.nas_device_id || null,
                    expires_at: new Date(createForm.expires_at).toISOString(),
                },
            });
            setCreateForm(emptyCreateForm);
            setShowCreate(false);
            await fetchData();
        } catch (requestError) {
            setCreateError(getApiErrorInfo(requestError).message);
        } finally {
            setSaving(false);
        }
    };

    const deleteSubscriber = async (sub: Subscriber) => {
        if (!sub.id) return;
        if (!window.confirm(`Xoá user "${sub.username}"? Toàn bộ mật khẩu, phiên đăng nhập và lịch sử sử dụng gắn với user này sẽ không còn hiển thị ở đâu nữa.`)) return;
        setBusyId(sub.id);
        try {
            await SubscribersService.deleteSubscribers({ subscriberId: sub.id });
            await fetchData();
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setBusyId('');
        }
    };

    const toggleLock = async (sub: Subscriber) => {
        if (!sub.id) return;
        setBusyId(sub.id);
        try {
            await SubscribersService.patchSubscribers({ subscriberId: sub.id, requestBody: { status: sub.status === 'SUSPENDED' ? Subscriber.status.ACTIVE : Subscriber.status.SUSPENDED } });
            await fetchData();
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setBusyId('');
        }
    };

    const toggleSelected = (id?: string) => {
        if (!id) return;
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev => prev.size === subscribers.length ? new Set() : new Set(subscribers.map(s => s.id).filter((id): id is string => !!id)));
    };

    // Chua co endpoint bulk-status/bulk-delete rieng o backend -- lap qua tung endpoint DON da co
    // san (dung Promise.all) thay vi doi backend them API moi chi cho hanh dong "chon nhieu dong".
    const bulkAction = async (action: 'lock' | 'unlock' | 'delete') => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        if (action === 'delete' && !window.confirm(`Xoá ${ids.length} user đã chọn? Không thể hoàn tác.`)) return;
        setBulkBusy(true);
        setBulkError('');
        try {
            if (action === 'delete') {
                await Promise.all(ids.map(id => SubscribersService.deleteSubscribers({ subscriberId: id })));
            } else {
                const status = action === 'lock' ? Subscriber.status.SUSPENDED : Subscriber.status.ACTIVE;
                await Promise.all(ids.map(id => SubscribersService.patchSubscribers({ subscriberId: id, requestBody: { status } })));
            }
            await fetchData();
        } catch (requestError) {
            setBulkError(getApiErrorInfo(requestError).message);
        } finally {
            setBulkBusy(false);
        }
    };

    const closeCreateModal = () => {
        setShowCreate(false);
        setCreateForm(emptyCreateForm);
        setCreateError('');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <KpiCard icon={<UsersIcon size={20} color="#fff" />} iconBg="#3b82f6" label="Tổng người dùng" value={formatCount(kpiTotal)} />
                <KpiCard icon={<Wifi size={20} color="#fff" />} iconBg="#10b981" label="Đang hoạt động" value={formatCount(kpiActive)} />
                <KpiCard icon={<UserX size={20} color="#fff" />} iconBg="#f59e0b" label="Đã hết hạn" value={formatCount(kpiExpired)} />
                <KpiCard icon={<BarChart3 size={20} color="#fff" />} iconBg="#8b5cf6" label="Tổng dung lượng đã dùng" value={`${formatBytes(kpiTrafficBytes).value} ${formatBytes(kpiTrafficBytes).unit}`} />
            </div>

            <div className="filters-bar" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <label className="filter-control filter-control-inline"><span>Tìm kiếm</span><input className="filter-select" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Tìm username..." /></label>
                    <label className="filter-control"><span>Nhóm</span>
                        <select className="filter-select" value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}>
                            <option value="">Tất cả nhóm</option>
                            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </label>
                    <label className="filter-control"><span>Trạng thái</span>
                        <select className="filter-select" value={tab} onChange={e => setTab(e.target.value as Tab)}>
                            <option value="ALL">Tất cả trạng thái</option>
                            <option value="ACTIVE">Hoạt động</option>
                            <option value="SUSPENDED">Tạm khoá</option>
                            <option value="EXPIRED">Hết hạn</option>
                        </select>
                    </label>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="filter-apply" onClick={() => setShowCreate(true)}>+ Tạo user</button>
                    <button type="button" className="button-secondary compact-button" disabled title="Chưa hỗ trợ — backend chưa có endpoint nhập hàng loạt"><Upload size={13} /> Nhập</button>
                    <button type="button" className="button-secondary compact-button" disabled title="Chưa hỗ trợ — backend chưa có endpoint xuất dữ liệu"><Download size={13} /> Xuất</button>
                    <button type="button" className="button-secondary compact-button" onClick={() => void fetchData()} title="Tải lại"><RefreshCw size={13} /></button>
                </div>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách user" description={error} onRetry={() => void fetchData()} />}

            {selectedIds.size > 0 && (
                <div className="inline-warning-line" style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.3)', color: 'var(--text-main)' }}>
                    <span>Đã chọn {selectedIds.size} user.</span>
                    <button type="button" disabled={bulkBusy} onClick={() => void bulkAction('lock')}>Khoá đã chọn</button>
                    <button type="button" disabled={bulkBusy} onClick={() => void bulkAction('unlock')}>Mở khoá đã chọn</button>
                    <button type="button" disabled={bulkBusy} onClick={() => void bulkAction('delete')} style={{ color: 'var(--danger)' }}>Xoá đã chọn</button>
                </div>
            )}
            {bulkError && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{bulkError}</p>}

            {loading && subscribers.length === 0 ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải danh sách user…</span></div>
            ) : (
                <section className="glass-panel dashboard-section">
                    <div className="table-shell">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" checked={subscribers.length > 0 && selectedIds.size === subscribers.length} onChange={toggleSelectAll} /></th>
                                    <th>#</th><th>Username</th><th>Tên hiển thị</th><th>Nhóm</th><th>Gói cước</th><th>Hết hạn</th><th>Lưu lượng</th><th>Trạng thái</th><th style={{ textAlign: 'right' }}>Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {subscribers.map((sub, index) => (
                                    <tr key={sub.id}>
                                        <td><input type="checkbox" checked={!!sub.id && selectedIds.has(sub.id)} onChange={() => toggleSelected(sub.id)} /></td>
                                        <td className="muted-text">{index + 1}</td>
                                        <td><Link to={`/users/${sub.id}`}><strong>{sub.username}</strong></Link></td>
                                        <td>{sub.display_name || <span className="muted-text">Chưa đặt</span>}</td>
                                        <td>{tenantName(sub.tenant_id)}</td>
                                        <td>{packageName(sub.package_id)}</td>
                                        <td>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('vi-VN') : 'Không rõ'}</td>
                                        <td>{formatBytes(sub.quota_used_bytes).value} {formatBytes(sub.quota_used_bytes).unit} / {quotaOf(sub.package_id)} GB</td>
                                        <td><span className={`status-dot ${sub.status === 'ACTIVE' ? 'healthy' : sub.status === 'SUSPENDED' ? 'warning' : 'critical'}`}>{sub.status === 'ACTIVE' ? 'Hoạt động' : sub.status === 'SUSPENDED' ? 'Tạm khoá' : 'Hết hạn'}</span></td>
                                        <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                            <IconAction title="Xem chi tiết" tone="blue" onClick={() => navigate(`/users/${sub.id}`)}><Eye size={14} /></IconAction>
                                            <IconAction title={sub.status === 'SUSPENDED' ? 'Mở khoá' : 'Khoá tài khoản'} tone="amber" disabled={busyId === sub.id || sub.status === 'EXPIRED'} onClick={() => void toggleLock(sub)}>
                                                {sub.status === 'SUSPENDED' ? <Unlock size={14} /> : <Lock size={14} />}
                                            </IconAction>
                                            <IconAction title="Xoá user" tone="red" disabled={busyId === sub.id} onClick={() => void deleteSubscriber(sub)}><Trash2 size={14} /></IconAction>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {subscribers.length === 0 && !loading && <div className="empty-state">Không có user nào khớp bộ lọc hiện tại.</div>}
                    {subscribers.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                            <span>Hiển thị 1–{subscribers.length} / {subscribers.length} người dùng{subscribers.length >= 500 ? ' (đã đạt giới hạn 500, thu hẹp bộ lọc để xem đầy đủ)' : ''}</span>
                        </div>
                    )}
                </section>
            )}

            {showCreate && (
                <div className="modal-overlay" role="dialog" onClick={closeCreateModal}>
                    <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
                        <div className="section-heading"><div><h2>Thêm user mới</h2></div><button type="button" className="button-secondary compact-button" onClick={closeCreateModal}>✕</button></div>
                        <form onSubmit={createSubscriber} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <label className="filter-control"><span>Tenant</span>
                                <select className="filter-select" required value={createForm.tenant_id} onChange={e => setCreateForm({ ...createForm, tenant_id: e.target.value })}>
                                    <option value="">-- chọn tenant --</option>
                                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </label>
                            <label className="filter-control"><span>Username</span><input className="filter-select" required value={createForm.username} onChange={e => setCreateForm({ ...createForm, username: e.target.value })} /></label>
                            <label className="filter-control"><span>Mật khẩu</span><input className="filter-select" type="text" required minLength={4} value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Tối thiểu 4 ký tự" /></label>
                            <label className="filter-control"><span>Tên hiển thị (tuỳ chọn)</span><input className="filter-select" value={createForm.display_name} onChange={e => setCreateForm({ ...createForm, display_name: e.target.value })} placeholder="vd: Nguyễn Văn A" /></label>
                            <label className="filter-control"><span>Loại</span>
                                <select className="filter-select" value={createForm.auth_type} onChange={e => setCreateForm({ ...createForm, auth_type: e.target.value as Subscriber.auth_type })}>
                                    <option value="PPPOE">PPPoE</option>
                                    <option value="HOTSPOT">Hotspot</option>
                                </select>
                            </label>
                            <label className="filter-control"><span>MikroTik (NAS)</span>
                                <select className="filter-select" value={createForm.nas_device_id} onChange={e => setCreateForm({ ...createForm, nas_device_id: e.target.value })}>
                                    <option value="">-- chưa gán --</option>
                                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </label>
                            <label className="filter-control"><span>Gói cước</span>
                                <select className="filter-select" required value={createForm.package_id} onChange={e => setCreateForm({ ...createForm, package_id: e.target.value })}>
                                    <option value="">-- chọn gói --</option>
                                    {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </label>
                            <label className="filter-control"><span>Hết hạn</span><input className="filter-select" type="date" required value={createForm.expires_at} onChange={e => setCreateForm({ ...createForm, expires_at: e.target.value })} /></label>

                            {createError && <DataStateNotice dataStatus="UNAVAILABLE" title="Tạo user thất bại" description={createError} />}

                            <button type="submit" className="filter-apply" disabled={saving}>{saving ? 'Đang tạo…' : 'Tạo user'}</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
