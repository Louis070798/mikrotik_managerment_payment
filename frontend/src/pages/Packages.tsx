import React, { useCallback, useEffect, useState } from 'react';
import { PackagesService, TenantsService } from '../api';
import { Package } from '../api/models/Package';
import type { Tenant } from '../api/models/Tenant';
import { DataStateNotice } from '../components/DataStateNotice';
import { getApiErrorInfo } from '../lib/dashboard';

type FormState = {
    tenant_id: string;
    name: string;
    down_mbps: string;
    up_mbps: string;
    quota_gb: string;
    duration_unit: Package.duration_unit;
    duration_value: string;
    price_vnd: string;
    max_concurrent_devices: string;
};

const emptyForm: FormState = {
    tenant_id: '',
    name: '',
    down_mbps: '',
    up_mbps: '',
    quota_gb: '',
    duration_unit: Package.duration_unit.MONTH,
    duration_value: '1',
    price_vnd: '',
    max_concurrent_devices: '1',
};

function toForm(pkg: Package): FormState {
    return {
        tenant_id: pkg.tenant_id ?? '',
        name: pkg.name ?? '',
        down_mbps: String(pkg.down_mbps ?? ''),
        up_mbps: String(pkg.up_mbps ?? ''),
        quota_gb: String(pkg.quota_gb ?? ''),
        duration_unit: pkg.duration_unit ?? Package.duration_unit.MONTH,
        duration_value: String(pkg.duration_value ?? ''),
        price_vnd: String(pkg.price_vnd ?? ''),
        max_concurrent_devices: String(pkg.max_concurrent_devices ?? '1'),
    };
}

export const Packages: React.FC = () => {
    const [packages, setPackages] = useState<Package[]>([]);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedId, setSelectedId] = useState<string>('');
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [pkgRes, tenantRes] = await Promise.all([
                PackagesService.getPackages({}),
                TenantsService.getTenants({}),
            ]);
            setPackages(pkgRes.data ?? []);
            setTenants(tenantRes.data ?? []);
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const selectPackage = (pkg?: Package) => {
        setSaveError('');
        if (pkg) {
            setSelectedId(pkg.id ?? '');
            setForm(toForm(pkg));
        } else {
            setSelectedId('');
            setForm(emptyForm);
        }
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSaveError('');
        const body = {
            tenant_id: form.tenant_id || null,
            name: form.name,
            down_mbps: Number(form.down_mbps),
            up_mbps: Number(form.up_mbps),
            quota_gb: Number(form.quota_gb),
            duration_unit: form.duration_unit,
            duration_value: Number(form.duration_value),
            price_vnd: Number(form.price_vnd),
            max_concurrent_devices: Number(form.max_concurrent_devices) || 1,
        };
        try {
            if (selectedId) {
                await PackagesService.patchPackages({ packageId: selectedId, requestBody: body });
            } else {
                await PackagesService.postPackages({ requestBody: body });
            }
            selectPackage(undefined);
            await fetchData();
        } catch (requestError) {
            setSaveError(getApiErrorInfo(requestError).message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (pkg: Package) => {
        if (!pkg.id) return;
        try {
            await PackagesService.deletePackages({ packageId: pkg.id });
            if (selectedId === pkg.id) selectPackage(undefined);
            await fetchData();
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        }
    };

    return (
        <div>
            <div className="top-bar">
                <div><h1>Gói cước</h1><p className="page-subtitle">Quản lý gói cước PPPoE/Hotspot — tốc độ, quota, thời hạn và giá.</p></div>
                <span className="freshness-indicator">{loading ? 'Đang tải…' : `${packages.length} gói`}</span>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được danh sách gói cước" description={error} onRetry={() => void fetchData()} />}

            {loading && packages.length === 0 ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải gói cước…</span></div>
            ) : (
                <div className="ship-dashboard-columns">
                    <section className="glass-panel dashboard-section" style={{ flex: 2 }}>
                        <div className="section-heading">
                            <div><h2>Danh sách gói</h2><p>Chọn một gói để sửa, hoặc tạo gói mới ở panel bên phải.</p></div>
                            <button type="button" className="button-secondary compact-button" onClick={() => selectPackage(undefined)}>+ Gói mới</button>
                        </div>
                        <div className="table-shell">
                            <table className="data-table">
                                <thead>
                                    <tr><th>Tên</th><th>Tốc độ</th><th>Quota</th><th>Thời hạn</th><th>Giá</th><th>Đang dùng</th><th>Hành động</th></tr>
                                </thead>
                                <tbody>
                                    {packages.map(pkg => (
                                        <tr key={pkg.id} className={selectedId === pkg.id ? 'selected' : ''}>
                                            <td><strong style={{ cursor: 'pointer' }} onClick={() => selectPackage(pkg)}>{pkg.name}</strong><div className="muted-text">{pkg.tenant_id ? 'Riêng tenant' : 'Dùng chung'}</div></td>
                                            <td>{pkg.down_mbps}/{pkg.up_mbps} Mbps</td>
                                            <td>{pkg.quota_gb} GB</td>
                                            <td>{pkg.duration_value} {pkg.duration_unit === 'DAY' ? 'ngày' : 'tháng'}</td>
                                            <td>{(pkg.price_vnd ?? 0).toLocaleString('vi-VN')} đ</td>
                                            <td>{pkg.subscriber_count ?? 0}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button type="button" className="button-secondary compact-button" onClick={() => selectPackage(pkg)}>Sửa</button>
                                                    <button type="button" className="button-secondary compact-button" onClick={() => void remove(pkg)}>Xoá</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {packages.length === 0 && !loading && <div className="empty-state">Chưa có gói cước nào.</div>}
                    </section>

                    <section className="glass-panel dashboard-section" style={{ flex: 1 }}>
                        <div className="section-heading"><div><h2>{selectedId ? 'Sửa gói' : 'Tạo gói mới'}</h2></div></div>
                        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <label className="filter-control"><span>Tên gói</span><input className="filter-select" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
                            <label className="filter-control"><span>Tenant (để trống = dùng chung)</span>
                                <select className="filter-select" value={form.tenant_id} onChange={e => setForm({ ...form, tenant_id: e.target.value })}>
                                    <option value="">Dùng chung mọi tenant</option>
                                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <label className="filter-control" style={{ flex: 1 }}><span>Down (Mbps)</span><input className="filter-select" type="number" required value={form.down_mbps} onChange={e => setForm({ ...form, down_mbps: e.target.value })} /></label>
                                <label className="filter-control" style={{ flex: 1 }}><span>Up (Mbps)</span><input className="filter-select" type="number" required value={form.up_mbps} onChange={e => setForm({ ...form, up_mbps: e.target.value })} /></label>
                            </div>
                            <label className="filter-control"><span>Quota (GB)</span><input className="filter-select" type="number" required value={form.quota_gb} onChange={e => setForm({ ...form, quota_gb: e.target.value })} /></label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <label className="filter-control" style={{ flex: 1 }}><span>Đơn vị thời hạn</span>
                                    <select className="filter-select" value={form.duration_unit} onChange={e => setForm({ ...form, duration_unit: e.target.value as Package.duration_unit })}>
                                        <option value="DAY">Ngày</option>
                                        <option value="MONTH">Tháng</option>
                                    </select>
                                </label>
                                <label className="filter-control" style={{ flex: 1 }}><span>Số lượng</span><input className="filter-select" type="number" required value={form.duration_value} onChange={e => setForm({ ...form, duration_value: e.target.value })} /></label>
                            </div>
                            <label className="filter-control"><span>Giá (VNĐ)</span><input className="filter-select" type="number" required value={form.price_vnd} onChange={e => setForm({ ...form, price_vnd: e.target.value })} /></label>
                            <label className="filter-control"><span>Số thiết bị đồng thời</span><input className="filter-select" type="number" min={1} value={form.max_concurrent_devices} onChange={e => setForm({ ...form, max_concurrent_devices: e.target.value })} /></label>

                            {saveError && <DataStateNotice dataStatus="UNAVAILABLE" title="Lưu gói thất bại" description={saveError} />}

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="submit" className="filter-apply" disabled={saving}>{saving ? 'Đang lưu…' : selectedId ? 'Lưu thay đổi' : 'Tạo gói'}</button>
                                {selectedId && <button type="button" className="button-secondary compact-button" onClick={() => selectPackage(undefined)}>Huỷ</button>}
                            </div>
                        </form>
                    </section>
                </div>
            )}
        </div>
    );
};
