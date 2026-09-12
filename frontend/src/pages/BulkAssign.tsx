import React, { useCallback, useEffect, useState } from 'react';
import { InventoryService, PackagesService, SubscribersService } from '../api';
import type { Subscriber } from '../api/models/Subscriber';
import type { Package } from '../api/models/Package';
import type { Device } from '../api/models/Device';
import { DataStateNotice } from '../components/DataStateNotice';
import { getApiErrorInfo } from '../lib/dashboard';

const steps = ['Chọn user', 'Chọn MikroTik/NAS', 'Chọn gói cước', 'Xác nhận'];

export const BulkAssign: React.FC = () => {
    const [step, setStep] = useState(0);
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [nasDeviceId, setNasDeviceId] = useState('');
    const [packageId, setPackageId] = useState('');
    const [applying, setApplying] = useState(false);
    const [applyError, setApplyError] = useState('');
    const [result, setResult] = useState<{ updated_count: number }>();

    useEffect(() => {
        setLoading(true);
        Promise.all([
            SubscribersService.getSubscribers({}),
            InventoryService.getDevices({}),
            PackagesService.getPackages({}),
        ])
            .then(([subRes, devRes, pkgRes]) => {
                setSubscribers(subRes.data ?? []);
                setDevices(devRes.data ?? []);
                setPackages(pkgRes.data ?? []);
            })
            .catch(requestError => setError(getApiErrorInfo(requestError).message))
            .finally(() => setLoading(false));
    }, []);

    const toggleAll = () => {
        setSelectedIds(selectedIds.size === subscribers.length ? new Set() : new Set(subscribers.map(s => s.id ?? '')));
    };

    const toggleOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const apply = useCallback(async () => {
        setApplying(true);
        setApplyError('');
        try {
            const res = await SubscribersService.postSubscribersBulkAssign({
                requestBody: {
                    subscriber_ids: [...selectedIds],
                    package_id: packageId || undefined,
                    nas_device_id: nasDeviceId || undefined,
                },
            });
            setResult({ updated_count: res.data?.updated_count ?? 0 });
        } catch (requestError) {
            setApplyError(getApiErrorInfo(requestError).message);
        } finally {
            setApplying(false);
        }
    }, [selectedIds, packageId, nasDeviceId]);

    const revenueDelta = packages.find(p => p.id === packageId)?.price_vnd;

    return (
        <div>
            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được dữ liệu" description={error} />}

            <div className="tab-row" role="tablist">
                {steps.map((label, index) => (
                    <button key={label} type="button" className={step === index ? 'active' : ''} disabled={index > step && selectedIds.size === 0} onClick={() => index <= step && setStep(index)}>
                        {index + 1}. {label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải…</span></div>
            ) : result ? (
                <DataStateNotice title="Đã áp dụng thành công" description={`Đã cập nhật ${result.updated_count} subscriber.`} />
            ) : (
                <section className="glass-panel dashboard-section">
                    {step === 0 && (
                        <>
                            <div className="section-heading"><div><h2>Bước 1 — Chọn user</h2><p>{selectedIds.size} / {subscribers.length} đã chọn</p></div><button type="button" className="button-secondary compact-button" onClick={toggleAll}>{selectedIds.size === subscribers.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button></div>
                            <div className="table-shell">
                                <table className="data-table">
                                    <thead><tr><th></th><th>Username</th><th>Gói hiện tại</th><th>Trạng thái</th></tr></thead>
                                    <tbody>
                                        {subscribers.map(sub => (
                                            <tr key={sub.id} onClick={() => sub.id && toggleOne(sub.id)} style={{ cursor: 'pointer' }}>
                                                <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={sub.id ? selectedIds.has(sub.id) : false} onChange={() => sub.id && toggleOne(sub.id)} /></td>
                                                <td>{sub.username}</td>
                                                <td>{packages.find(p => p.id === sub.package_id)?.name ?? 'Không rõ'}</td>
                                                <td><span className={`status-dot ${sub.status === 'ACTIVE' ? 'healthy' : 'warning'}`}>{sub.status}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" className="filter-apply" disabled={selectedIds.size === 0} onClick={() => setStep(1)} style={{ marginTop: 12 }}>Tiếp tục ({selectedIds.size} user)</button>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <div className="section-heading"><div><h2>Bước 2 — Chọn MikroTik/NAS</h2><p>Để trống = giữ nguyên thiết bị hiện tại của mỗi user.</p></div></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <label className="filter-control"><input type="radio" name="nas" checked={nasDeviceId === ''} onChange={() => setNasDeviceId('')} /> Giữ nguyên thiết bị hiện tại</label>
                                {devices.map(d => (
                                    <label key={d.id} className="filter-control"><input type="radio" name="nas" checked={nasDeviceId === d.id} onChange={() => setNasDeviceId(d.id ?? '')} /> {d.name}</label>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button type="button" className="button-secondary compact-button" onClick={() => setStep(0)}>← Quay lại</button>
                                <button type="button" className="filter-apply" onClick={() => setStep(2)}>Tiếp tục</button>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <div className="section-heading"><div><h2>Bước 3 — Chọn gói cước</h2></div></div>
                            <div className="area-selector-grid">
                                {packages.map(p => (
                                    <button key={p.id} type="button" className={`area-selector ${packageId === p.id ? 'selected' : ''}`} onClick={() => setPackageId(p.id ?? '')}>
                                        <strong>{p.name}</strong>
                                        <small>{p.down_mbps}/{p.up_mbps} Mbps · {p.quota_gb} GB · {(p.price_vnd ?? 0).toLocaleString('vi-VN')} đ</small>
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button type="button" className="button-secondary compact-button" onClick={() => setStep(1)}>← Quay lại</button>
                                <button type="button" className="filter-apply" disabled={!packageId} onClick={() => setStep(3)}>Tiếp tục</button>
                            </div>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <div className="section-heading"><div><h2>Bước 4 — Xác nhận</h2></div></div>
                            <div className="dashboard-meta">
                                <span><strong>Số user:</strong> {selectedIds.size}</span>
                                <span><strong>NAS mới:</strong> {nasDeviceId ? devices.find(d => d.id === nasDeviceId)?.name : 'Giữ nguyên'}</span>
                                <span><strong>Gói mới:</strong> {packages.find(p => p.id === packageId)?.name ?? 'Không đổi'}</span>
                                {revenueDelta !== undefined && <span><strong>Giá gói mới:</strong> {revenueDelta.toLocaleString('vi-VN')} đ/kỳ mỗi user</span>}
                            </div>
                            {applyError && <DataStateNotice dataStatus="UNAVAILABLE" title="Áp dụng thất bại" description={applyError} />}
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button type="button" className="button-secondary compact-button" onClick={() => setStep(2)}>← Quay lại</button>
                                <button type="button" className="filter-apply" disabled={applying} onClick={() => void apply()}>{applying ? 'Đang áp dụng…' : 'Áp dụng'}</button>
                            </div>
                        </>
                    )}
                </section>
            )}
        </div>
    );
};
