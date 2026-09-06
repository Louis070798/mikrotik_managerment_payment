import React, { useCallback, useEffect, useState } from 'react';
import { TenantsService } from '../api';
import type { Tenant } from '../api/models/Tenant';
import { AwaitingContract, DataStateNotice } from '../components/DataStateNotice';
import { getApiErrorInfo } from '../lib/dashboard';

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

export const Tenants: React.FC = () => {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

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
        if (t) { setSelectedId(t.id ?? ''); setForm(toForm(t)); } else { setSelectedId(''); setForm(emptyForm); }
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSaveError('');
        try {
            if (selectedId) {
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
            } else {
                await TenantsService.postTenants({
                    requestBody: {
                        parent_id: form.parent_id || null,
                        code: form.code,
                        name: form.name,
                        contact_name: form.contact_name || null,
                        contact_phone: form.contact_phone || null,
                        contact_email: form.contact_email || null,
                        address: form.address || null,
                        tax_id: form.tax_id || null,
                    },
                });
            }
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

    const depthById = buildDepth(tenants);
    const sorted = [...tenants].sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));

    return (
        <div>
            <div className="top-bar">
                <div><h1>Tenant & phân cấp</h1><p className="page-subtitle">Nhà cung cấp → Công ty/Đại lý → Chi nhánh. Chọn một tenant để sửa hoặc tạo tenant con.</p></div>
                <span className="freshness-indicator">{loading ? 'Đang tải…' : `${tenants.length} tenant`}</span>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách tenant" description={error} onRetry={() => void fetchData()} />}

            {loading && tenants.length === 0 ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải tenant…</span></div>
            ) : (
                <div className="ship-dashboard-columns">
                    <section className="glass-panel ship-list-panel" style={{ flex: '0 0 360px' }}>
                        <div className="section-heading">
                            <div><h2>Cây tổ chức</h2></div>
                            <button type="button" className="button-secondary compact-button" onClick={() => select(undefined)}>+ Tenant mới</button>
                        </div>
                        <div className="ship-list">
                            {sorted.map(t => (
                                <button key={t.id} type="button" className={`ship-list-item ${selectedId === t.id ? 'selected' : ''}`} style={{ paddingLeft: `${0.75 + (depthById.get(t.id ?? '') ?? 0) * 1.25}rem` }} onClick={() => select(t)}>
                                    <span><strong>{t.name}</strong><small>{t.code}</small></span>
                                </button>
                            ))}
                        </div>
                        {tenants.length === 0 && !loading && <div className="empty-state">Chưa có tenant nào.</div>}
                    </section>

                    <main className="ship-main-panel">
                        <section className="glass-panel dashboard-section">
                            <div className="section-heading"><div><h2>{selectedId ? 'Sửa tenant' : 'Tạo tenant mới'}</h2></div></div>
                            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
                                {!selectedId && (
                                    <label className="filter-control"><span>Tenant cha (để trống = tenant gốc)</span>
                                        <select className="filter-select" value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}>
                                            <option value="">-- tenant gốc --</option>
                                            {sorted.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </label>
                                )}
                                <label className="filter-control"><span>Mã tenant</span><input className="filter-select" required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></label>
                                <label className="filter-control"><span>Tên</span><input className="filter-select" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
                                <label className="filter-control"><span>Người đại diện</span><input className="filter-select" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <label className="filter-control" style={{ flex: 1 }}><span>Điện thoại</span><input className="filter-select" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></label>
                                    <label className="filter-control" style={{ flex: 1 }}><span>Email</span><input className="filter-select" type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></label>
                                </div>
                                <label className="filter-control"><span>Địa chỉ</span><input className="filter-select" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></label>
                                <label className="filter-control"><span>Mã số thuế</span><input className="filter-select" value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} /></label>

                                {saveError && <DataStateNotice dataStatus="UNAVAILABLE" title="Lưu tenant thất bại" description={saveError} />}

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="submit" className="filter-apply" disabled={saving}>{saving ? 'Đang lưu…' : selectedId ? 'Lưu thay đổi' : 'Tạo tenant'}</button>
                                    {selectedId && <button type="button" className="button-secondary compact-button" onClick={() => void remove(tenants.find(t => t.id === selectedId)!)}>Xoá tenant</button>}
                                    {selectedId && <button type="button" className="button-secondary compact-button" onClick={() => select(undefined)}>Huỷ</button>}
                                </div>
                            </form>
                        </section>

                        <AwaitingContract
                            title="Tài khoản quản trị / 2FA / ma trận quyền chưa có ở đây"
                            endpoint="Thuộc Auth/RBAC module thật, chưa nằm trong phạm vi hiện tại (xem backend/src/libs/auth-stub/auth-stub.guard.ts)"
                            detail="Thiết kế tham khảo có bảng tài khoản quản trị theo phạm vi và ma trận quyền theo cấp — phần này cần Auth/RBAC module thật, ngoài phạm vi Phase 1."
                        />
                    </main>
                </div>
            )}
        </div>
    );
};
