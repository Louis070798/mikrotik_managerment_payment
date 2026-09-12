import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CornerDownRight, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { TenantsService } from '../api';
import type { Tenant } from '../api/models/Tenant';
import { DataStateNotice } from '../components/DataStateNotice';
import { MiniStat } from '../components/MiniStat';
import { formatCount, getApiErrorInfo } from '../lib/dashboard';
import { useHeaderActions } from '../lib/headerActions';

type FormState = {
    parent_id: string;
    code: string;
    name: string;
    contact_name: string;
    contact_phone: string;
    contact_email: string;
    address: string;
    tax_id: string;
};

const emptyForm: FormState = { parent_id: '', code: '', name: '', contact_name: '', contact_phone: '', contact_email: '', address: '', tax_id: '' };

function toForm(t: Tenant): FormState {
    return {
        parent_id: t.parent_id ?? '',
        code: t.code ?? '',
        name: t.name ?? '',
        contact_name: t.contact_name ?? '',
        contact_phone: t.contact_phone ?? '',
        contact_email: t.contact_email ?? '',
        address: t.address ?? '',
        tax_id: t.tax_id ?? '',
    };
}

function buildDepth(tenants: Tenant[]): Map<string, number> {
    const byId = new Map(tenants.map(t => [t.id ?? '', t]));
    const depth = new Map<string, number>();
    const resolve = (id: string): number => {
        if (depth.has(id)) return depth.get(id) as number;
        const node = byId.get(id);
        const d = node?.parent_id ? resolve(node.parent_id) + 1 : 0;
        depth.set(id, d);
        return d;
    };
    tenants.forEach(t => resolve(t.id ?? ''));
    return depth;
}

// ---------- ô nhập gọn dùng chung với trang Cài đặt: nhãn phía trên, ô nhập phía dưới ----------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div className="settings-field"><label>{label}</label>{children}</div>;
}

export const Tenants: React.FC = () => {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // ---- Tao tenant moi qua popup: admin tu go username+mat khau ngay trong form (bo tinh nang
    // tu sinh mat khau ngau nhien) -- dong popup ngay khi tao xong, khong can man hinh "hien 1 lan". ----
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState<FormState & { password: string }>({ ...emptyForm, password: '' });
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState('');

    // ---- Dat lai mat khau dang nhap cho tenant DA CO SAN (o panel sua) -- admin tu go mat khau moi ----
    const [newPasswordForSelected, setNewPasswordForSelected] = useState('');
    const [pwBusy, setPwBusy] = useState(false);
    const [pwError, setPwError] = useState('');
    const [pwSaved, setPwSaved] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await TenantsService.getTenants({});
            setTenants(res.data ?? []);
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const select = (t?: Tenant) => {
        setSaveError('');
        setNewPasswordForSelected('');
        setPwError('');
        if (t) { setSelectedId(t.id ?? ''); setForm(toForm(t)); } else { setSelectedId(''); setForm(emptyForm); }
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSaveError('');
        try {
            await TenantsService.patchTenants({
                tenantId: selectedId,
                requestBody: {
                    code: form.code,
                    name: form.name,
                    contact_name: form.contact_name || null,
                    contact_phone: form.contact_phone || null,
                    contact_email: form.contact_email || null,
                    address: form.address || null,
                    tax_id: form.tax_id || null,
                },
            });
            select(undefined);
            await fetchData();
        } catch (requestError) {
            setSaveError(getApiErrorInfo(requestError).message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (t: Tenant) => {
        if (!t.id) return;
        try {
            await TenantsService.deleteTenants({ tenantId: t.id });
            if (selectedId === t.id) select(undefined);
            await fetchData();
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        }
    };

    const openCreateModal = () => {
        setCreateForm({ ...emptyForm, password: '' });
        setCreateError('');
        setShowCreateModal(true);
    };

    const closeCreateModal = () => {
        setShowCreateModal(false);
    };

    const createTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateSaving(true);
        setCreateError('');
        try {
            // Admin tu go mat khau THAT ngay trong form nay (bo tinh nang tu sinh mat khau ngau
            // nhien) -- username van tu sinh tu code nhu truoc. Server chi luu ban bam, khong tra
            // lai plaintext nen khong can man hinh "hien 1 lan" sau khi tao xong.
            await TenantsService.postTenants({
                requestBody: {
                    parent_id: createForm.parent_id || null,
                    code: createForm.code,
                    name: createForm.name,
                    password: createForm.password,
                    contact_name: createForm.contact_name || null,
                    contact_phone: createForm.contact_phone || null,
                    contact_email: createForm.contact_email || null,
                    address: createForm.address || null,
                    tax_id: createForm.tax_id || null,
                },
            });
            setShowCreateModal(false);
            await fetchData();
        } catch (requestError) {
            setCreateError(getApiErrorInfo(requestError).message);
        } finally {
            setCreateSaving(false);
        }
    };

    const setPasswordForSelected = async () => {
        if (!selectedId || newPasswordForSelected.length < 4) return;
        setPwBusy(true);
        setPwError('');
        try {
            await TenantsService.postTenantsPassword({ tenantId: selectedId, requestBody: { password: newPasswordForSelected } });
            setNewPasswordForSelected('');
            setPwSaved(true);
            setTimeout(() => setPwSaved(false), 2500);
            await fetchData();
        } catch (requestError) {
            setPwError(getApiErrorInfo(requestError).message);
        } finally {
            setPwBusy(false);
        }
    };

    const revokePasswordForSelected = async () => {
        if (!selectedId) return;
        setPwBusy(true);
        setPwError('');
        try {
            await TenantsService.deleteTenantsPassword({ tenantId: selectedId });
            await fetchData();
        } catch (requestError) {
            setPwError(getApiErrorInfo(requestError).message);
        } finally {
            setPwBusy(false);
        }
    };

    const depthById = buildDepth(tenants);
    const sorted = [...tenants].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
    const selectedTenant = tenants.find(t => t.id === selectedId);
    const rootCount = tenants.filter(t => !t.parent_id).length;
    const withLoginCount = tenants.filter(t => t.password_configured).length;

    useHeaderActions(
        <button type="button" className="filter-apply" onClick={openCreateModal}>+ Tenant mới</button>,
        [],
    );

    return (
        <div>
            <div className="mini-stat-row">
                <MiniStat label="Tổng tenant" value={formatCount(tenants.length)} status="healthy" />
                <MiniStat label="Tenant gốc" value={formatCount(rootCount)} />
                <MiniStat label="Đã có tài khoản" value={formatCount(withLoginCount)} status={withLoginCount > 0 ? 'healthy' : 'unknown'} />
                <MiniStat label="Chưa có tài khoản" value={formatCount(tenants.length - withLoginCount)} status={tenants.length - withLoginCount > 0 ? 'warning' : 'healthy'} />
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách tenant" description={error} onRetry={() => void fetchData()} />}

            {loading && tenants.length === 0 ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải tenant…</span></div>
            ) : (
                <div className="ship-dashboard-columns">
                    <section className="glass-panel ship-list-panel" style={{ flex: '0 0 360px' }}>
                        <div className="section-heading"><div><h2>Cây tổ chức</h2></div></div>
                        <div className="ship-list">
                            {sorted.map(t => {
                                const depth = depthById.get(t.id ?? '') ?? 0;
                                return (
                                    <button key={t.id} type="button" className={`ship-list-item ${selectedId === t.id ? 'selected' : ''}`} style={{ paddingLeft: `${0.75 + depth * 1.5}rem`, display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => select(t)}>
                                        {depth === 0 ? <Building2 size={15} style={{ flex: 'none', opacity: 0.7 }} /> : <CornerDownRight size={15} style={{ flex: 'none', opacity: 0.5 }} />}
                                        <span style={{ flex: 1, minWidth: 0 }}><strong>{t.name}</strong><small>{t.code}{t.username ? ` · ${t.username}` : ''}</small></span>
                                        {t.password_configured ? <ShieldCheck size={15} color="var(--success)" style={{ flex: 'none' }} /> : <ShieldOff size={15} color="var(--text-muted)" style={{ flex: 'none' }} />}
                                    </button>
                                );
                            })}
                        </div>
                        {tenants.length === 0 && !loading && <div className="empty-state">Chưa có tenant nào.</div>}
                    </section>

                    <main className="ship-main-panel">
                        {selectedId && selectedTenant ? (
                            <>
                                <section className="glass-panel dashboard-section">
                                    <div className="section-heading">
                                        <div><h2>{selectedTenant.name}</h2><p>Mã <code>{selectedTenant.code}</code></p></div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button type="button" className="button-secondary compact-button" onClick={() => void remove(selectedTenant)}>Xoá tenant</button>
                                            <button type="button" className="button-secondary compact-button" onClick={() => select(undefined)}>Đóng</button>
                                        </div>
                                    </div>
                                    <form onSubmit={save}>
                                        <h3 style={{ fontSize: 13, margin: '4px 0 8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Thông tin tổ chức</h3>
                                        <div className="settings-field-grid">
                                            <Field label="Mã tenant"><input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
                                            <Field label="Tên"><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
                                            <Field label="Mã số thuế"><input value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} /></Field>
                                        </div>

                                        <h3 style={{ fontSize: 13, margin: '4px 0 8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Liên hệ</h3>
                                        <div className="settings-field-grid">
                                            <Field label="Người đại diện"><input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></Field>
                                            <Field label="Điện thoại"><input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></Field>
                                            <Field label="Email"><input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></Field>
                                            <Field label="Địa chỉ"><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
                                        </div>

                                        {saveError && <DataStateNotice dataStatus="UNAVAILABLE" title="Lưu tenant thất bại" description={saveError} />}

                                        <button type="submit" className="filter-apply" disabled={saving} style={{ marginTop: 4 }}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
                                    </form>
                                </section>

                                <section className="glass-panel dashboard-section">
                                    <div className="section-heading">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <KeyRound size={18} style={{ opacity: 0.7 }} />
                                            <div><h2>Tài khoản đăng nhập</h2><p>Dùng để đăng nhập hệ thống qua trang Login.</p></div>
                                        </div>
                                        <span className={`state-badge ${selectedTenant.password_configured ? 'badge-success' : 'badge-warning'}`}>{selectedTenant.password_configured ? 'Đã kích hoạt' : 'Chưa kích hoạt'}</span>
                                    </div>
                                    {selectedTenant.password_configured ? (
                                        <div className="settings-current">Username <strong>{selectedTenant.username}</strong> · đã đặt lúc {selectedTenant.password_issued_at ? new Date(selectedTenant.password_issued_at).toLocaleString('vi-VN') : 'không rõ'}. Server chỉ giữ bản băm (scrypt), không lưu mật khẩu thật.</div>
                                    ) : (
                                        <p className="muted-text">Chưa có tài khoản đăng nhập — tenant này chưa thể đăng nhập vào hệ thống. Đặt mật khẩu bên dưới để kích hoạt (username sẽ tự sinh từ mã tenant).</p>
                                    )}
                                    <div className="settings-field" style={{ margin: '10px 0 6px', maxWidth: 280 }}>
                                        <label>{selectedTenant.password_configured ? 'Đặt lại mật khẩu' : 'Đặt mật khẩu'}</label>
                                        <input className="filter-select" type="text" minLength={4} value={newPasswordForSelected} onChange={e => setNewPasswordForSelected(e.target.value)} placeholder="Tối thiểu 4 ký tự" />
                                    </div>
                                    {pwError && <p style={{ color: '#dc2626', fontSize: 12 }}>{pwError}</p>}
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <button type="button" className="filter-apply" disabled={pwBusy || newPasswordForSelected.length < 4} onClick={() => void setPasswordForSelected()}>{pwBusy ? 'Đang lưu…' : 'Lưu mật khẩu'}</button>
                                        {selectedTenant.password_configured && <button type="button" className="button-secondary compact-button" disabled={pwBusy} onClick={() => void revokePasswordForSelected()}>Thu hồi</button>}
                                        {pwSaved && <span className="muted-text" style={{ color: 'var(--success)' }}>Đã lưu ✓</span>}
                                    </div>
                                </section>
                            </>
                        ) : (
                            <section className="glass-panel dashboard-section" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                                <Building2 size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                                <div className="empty-state" style={{ border: 'none', padding: 0 }}>Chọn 1 tenant bên trái để sửa, hoặc bấm "+ Tenant mới" để tạo.</div>
                            </section>
                        )}
                    </main>
                </div>
            )}

            {showCreateModal && (
                <div className="modal-overlay" role="dialog" onClick={closeCreateModal}>
                    <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
                        <div className="section-heading"><div><h2>Tạo tenant mới</h2></div><button type="button" className="button-secondary compact-button" onClick={closeCreateModal}>✕</button></div>
                        <form onSubmit={createTenant}>
                            <h3 style={{ fontSize: 13, margin: '4px 0 8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Thông tin tổ chức</h3>
                            <div className="settings-field-grid">
                                <Field label="Tenant cha">
                                    <select value={createForm.parent_id} onChange={e => setCreateForm({ ...createForm, parent_id: e.target.value })}>
                                        <option value="">-- tenant gốc --</option>
                                        {sorted.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Mã tenant"><input required value={createForm.code} onChange={e => setCreateForm({ ...createForm, code: e.target.value })} /></Field>
                                <Field label="Tên"><input required value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} /></Field>
                                <Field label="Mã số thuế"><input value={createForm.tax_id} onChange={e => setCreateForm({ ...createForm, tax_id: e.target.value })} /></Field>
                            </div>

                            <h3 style={{ fontSize: 13, margin: '4px 0 8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tài khoản đăng nhập</h3>
                            <div className="settings-field-grid">
                                <Field label="Mật khẩu"><input required type="text" minLength={4} value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Tối thiểu 4 ký tự" /></Field>
                            </div>
                            <p className="muted-text" style={{ fontSize: 12, margin: '-6px 0 10px' }}>Username sẽ tự sinh từ mã tenant.</p>

                            <h3 style={{ fontSize: 13, margin: '4px 0 8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Liên hệ</h3>
                            <div className="settings-field-grid">
                                <Field label="Người đại diện"><input value={createForm.contact_name} onChange={e => setCreateForm({ ...createForm, contact_name: e.target.value })} /></Field>
                                <Field label="Điện thoại"><input value={createForm.contact_phone} onChange={e => setCreateForm({ ...createForm, contact_phone: e.target.value })} /></Field>
                                <Field label="Email"><input type="email" value={createForm.contact_email} onChange={e => setCreateForm({ ...createForm, contact_email: e.target.value })} /></Field>
                                <Field label="Địa chỉ"><input value={createForm.address} onChange={e => setCreateForm({ ...createForm, address: e.target.value })} /></Field>
                            </div>

                            {createError && <DataStateNotice dataStatus="UNAVAILABLE" title="Tạo tenant thất bại" description={createError} />}

                            <button type="submit" className="filter-apply" disabled={createSaving}>{createSaving ? 'Đang tạo…' : 'Tạo tenant'}</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
