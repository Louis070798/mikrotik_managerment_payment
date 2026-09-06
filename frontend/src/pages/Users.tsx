import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InventoryService, PackagesService, SubscribersService, TenantsService } from '../api';
import { Subscriber } from '../api/models/Subscriber';
import type { Package } from '../api/models/Package';
import type { Device } from '../api/models/Device';
import type { Tenant } from '../api/models/Tenant';
import { DataStateNotice } from '../components/DataStateNotice';
import { SecretReveal } from '../components/SecretReveal';
import { formatBytes, getApiErrorInfo } from '../lib/dashboard';

type Tab = 'ACTIVE' | 'SUSPENDED' | 'ALL';

const emptyCreateForm = {
    tenant_id: '',
    username: '',
    auth_type: Subscriber.auth_type.PPPOE,
    package_id: '',
    nas_device_id: '',
    expires_at: '',
};

export const Users: React.FC = () => {
    const [tab, setTab] = useState<Tab>('ACTIVE');
    const [search, setSearch] = useState('');
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState(emptyCreateForm);
    const [createError, setCreateError] = useState('');
    const [saving, setSaving] = useState(false);
    const [createdUser, setCreatedUser] = useState<{ username: string; password: string }>();
    const [copyFeedback, setCopyFeedback] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [subRes, pkgRes, devRes, tenantRes] = await Promise.all([
                SubscribersService.getSubscribers({ status: tab === 'ALL' ? undefined : tab, q: search || undefined }),
                PackagesService.getPackages({}),
                InventoryService.getDevices({}),
                TenantsService.getTenants({}),
            ]);
            setSubscribers(subRes.data ?? []);
            setPackages(pkgRes.data ?? []);
            setDevices(devRes.data ?? []);
            setTenants(tenantRes.data ?? []);
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setLoading(false);
        }
    }, [tab, search]);

    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchData(); }, [fetchData]);

    const packageName = (id?: string | null) => packages.find(p => p.id === id)?.name ?? 'Không rõ';
    const deviceName = (id?: string | null) => devices.find(d => d.id === id)?.name ?? 'Chưa gán';
    const quotaOf = (id?: string | null) => packages.find(p => p.id === id)?.quota_gb ?? 0;

    const createSubscriber = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setCreateError('');
        try {
            const created = await SubscribersService.postSubscribers({
                requestBody: {
                    tenant_id: createForm.tenant_id,
                    username: createForm.username,
                    auth_type: createForm.auth_type,
                    package_id: createForm.package_id,
                    nas_device_id: createForm.nas_device_id || null,
                    expires_at: new Date(createForm.expires_at).toISOString(),
                },
            });
            // MikroTik Hotspot/PPPoE luôn cần username + password để đăng nhập thật — cấp mật khẩu
            // ngay lúc tạo (tự sinh ngẫu nhiên, đúng convention push-key/RADIUS secret của thiết bị)
            // thay vì để user không có cách nào đăng nhập cho tới khi ai đó vào trang chi tiết cấp riêng.
            const subscriberId = created.data?.id;
            if (subscriberId) {
                const pwRes = await SubscribersService.postSubscribersPassword({ subscriberId });
                if (pwRes.data?.password) setCreatedUser({ username: createForm.username, password: pwRes.data.password });
            }
            setCreateForm(emptyCreateForm);
            await fetchData();
        } catch (requestError) {
            setCreateError(getApiErrorInfo(requestError).message);
        } finally {
            setSaving(false);
        }
    };

    const closeCreateModal = () => {
        setShowCreate(false);
        setCreatedUser(undefined);
        setCopyFeedback(false);
    };

    const copyPassword = async () => {
        if (!createdUser) return;
        try {
            await navigator.clipboard.writeText(createdUser.password);
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 2000);
        } catch {
            setCopyFeedback(false);
        }
    };

    return (
        <div>
            <div className="top-bar">
                <div><h1>Người dùng</h1><p className="page-subtitle">Subscriber PPPoE/Hotspot — gán vào NAS và gói cước.</p></div>
                <span className="freshness-indicator">{loading ? 'Đang tải…' : `${subscribers.length} user`}</span>
            </div>

            <div className="tab-row" role="tablist">
                <button type="button" className={tab === 'ACTIVE' ? 'active' : ''} onClick={() => setTab('ACTIVE')}>Hoạt động</button>
                <button type="button" className={tab === 'SUSPENDED' ? 'active' : ''} onClick={() => setTab('SUSPENDED')}>Ngưng hoạt động</button>
                <button type="button" className={tab === 'ALL' ? 'active' : ''} onClick={() => setTab('ALL')}>Tất cả</button>
            </div>

            <div className="filters-bar">
                <label className="filter-control"><span>Tìm username</span><input className="filter-select" value={search} onChange={e => setSearch(e.target.value)} placeholder="vd: user001" /></label>
                <button type="button" className="filter-apply" onClick={() => void fetchData()}>Áp dụng</button>
                <button type="button" className="button-secondary compact-button" onClick={() => setShowCreate(true)}>+ Thêm user</button>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách user" description={error} onRetry={() => void fetchData()} />}

            {loading && subscribers.length === 0 ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải danh sách user…</span></div>
            ) : (
                <section className="glass-panel dashboard-section">
                    <div className="table-shell">
                        <table className="data-table">
                            <thead>
                                <tr><th>Username</th><th>Mật khẩu</th><th>Loại</th><th>NAS</th><th>Gói cước</th><th>Quota dùng</th><th>Hết hạn</th><th>Trạng thái</th><th></th></tr>
                            </thead>
                            <tbody>
                                {subscribers.map(sub => (
                                    <tr key={sub.id}>
                                        <td><Link to={`/users/${sub.id}`}><strong>{sub.username}</strong></Link></td>
                                        <td><span className={`status-dot ${sub.password_configured ? 'healthy' : 'warning'}`}>{sub.password_configured ? 'Đã cấp' : 'Chưa cấp'}</span></td>
                                        <td>{sub.auth_type}</td>
                                        <td>{deviceName(sub.nas_device_id)}</td>
                                        <td>{packageName(sub.package_id)}</td>
                                        <td>{formatBytes(sub.quota_used_bytes).value} {formatBytes(sub.quota_used_bytes).unit} / {quotaOf(sub.package_id)} GB</td>
                                        <td>{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString('vi-VN') : 'Không rõ'}</td>
                                        <td><span className={`status-dot ${sub.status === 'ACTIVE' ? 'healthy' : sub.status === 'SUSPENDED' ? 'warning' : 'critical'}`}>{sub.status}</span></td>
                                        <td><Link to={`/users/${sub.id}`}>Chi tiết →</Link></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {subscribers.length === 0 && !loading && <div className="empty-state">Không có user nào khớp bộ lọc hiện tại.</div>}
                </section>
            )}

            {showCreate && (
                <div className="modal-overlay" role="dialog" onClick={closeCreateModal}>
                    <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
                        {!createdUser ? (
                            <>
                                <div className="section-heading"><div><h2>Thêm user mới</h2></div><button type="button" className="button-secondary compact-button" onClick={closeCreateModal}>✕</button></div>
                                <form onSubmit={createSubscriber} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <label className="filter-control"><span>Tenant</span>
                                        <select className="filter-select" required value={createForm.tenant_id} onChange={e => setCreateForm({ ...createForm, tenant_id: e.target.value })}>
                                            <option value="">-- chọn tenant --</option>
                                            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </label>
                                    <label className="filter-control"><span>Username</span><input className="filter-select" required value={createForm.username} onChange={e => setCreateForm({ ...createForm, username: e.target.value })} /></label>
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
                            </>
                        ) : (
                            <>
                                <div className="section-heading"><div><h2>Đã tạo user "{createdUser.username}"</h2><p>Gửi 2 thông tin dưới đây cho người dùng để họ đăng nhập trang Hotspot/PPPoE của router.</p></div><button type="button" className="button-secondary compact-button" onClick={closeCreateModal}>✕</button></div>
                                <p><strong>Username:</strong> <code>{createdUser.username}</code></p>
                                <SecretReveal
                                    heading="Mật khẩu thật — chỉ hiển thị MỘT LẦN DUY NHẤT:"
                                    value={createdUser.password}
                                    copied={copyFeedback}
                                    onCopy={() => void copyPassword()}
                                    caption="Rời khỏi đây sẽ không xem lại được — vào trang chi tiết user để cấp lại nếu cần."
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                                    <button type="button" className="filter-apply" onClick={closeCreateModal}>Xong</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
