import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AuditService, CrewService, InventoryService, PackagesService, SubscribersService, TenantsService } from '../api';
import type { Subscriber } from '../api/models/Subscriber';
import type { Package } from '../api/models/Package';
import type { Device } from '../api/models/Device';
import type { Tenant } from '../api/models/Tenant';
import type { CrewSession } from '../api/models/CrewSession';
import type { CrewUser } from '../api/models/CrewUser';
import type { AuditLogEntry } from '../api/models/AuditLogEntry';
import { AwaitingContract, DataStateNotice } from '../components/DataStateNotice';
import { MiniStat } from '../components/MiniStat';
import { formatBytes, formatCount, formatVnd, getApiErrorInfo, isRecord } from '../lib/dashboard';

type DetailTab = 'Tổng quan' | 'Gói cước' | 'Sử dụng' | 'Phiên đăng nhập' | 'Lịch sử hoạt động';
const detailTabs: DetailTab[] = ['Tổng quan', 'Gói cước', 'Sử dụng', 'Phiên đăng nhập', 'Lịch sử hoạt động'];
const SERVICE_COLORS = ['#009688', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#84cc16'];

// Dich ngan cac ma action that tu audit_logs (xem *.service.ts .audit.record({action: '...'}))
// sang mo ta tieng Viet cho nguoi van hanh doc -- KHONG sinh mo ta gia, chi dich 1-1 tu ma da co.
const ACTION_LABELS: Record<string, string> = {
    'subscriber.create': 'Tạo tài khoản',
    'subscriber.update': 'Cập nhật thông tin',
    'subscriber.delete': 'Xoá tài khoản',
    'subscriber.password_issue': 'Cấp/đổi mật khẩu',
    'subscriber.password_revoke': 'Thu hồi mật khẩu',
    'subscriber.reset_quota': 'Reset dung lượng',
};

function usageRows(list: unknown, labelKey: 'app' | 'domain', limit = 10): Array<{ label: string; bytes: number }> {
    if (!Array.isArray(list)) return [];
    return list
        .filter(isRecord)
        .slice(0, limit)
        .map(item => ({
            label: typeof item[labelKey] === 'string' ? (item[labelKey] as string) : 'Không rõ',
            bytes: typeof item.bytes === 'number' ? item.bytes : 0,
        }));
}

type EditForm = { display_name: string; notes: string; package_id: string; nas_device_id: string; expires_at: string; status: Subscriber['status'] };

export const SubscriberDetail: React.FC = () => {
    const { subscriberId } = useParams<{ subscriberId: string }>();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<DetailTab>('Tổng quan');
    const [deleteBusy, setDeleteBusy] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [subscriber, setSubscriber] = useState<Subscriber>();
    const [pkg, setPkg] = useState<Package>();
    const [device, setDevice] = useState<Device>();
    const [tenant, setTenant] = useState<Tenant>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Danh sach day du goi cuoc/thiet bi -- rieng voi pkg/device o tren (chi thiet bi/goi DANG
    // gan cho subscriber nay) -- can them de dung cho dropdown "Sua thong tin" ben duoi.
    const [allPackages, setAllPackages] = useState<Package[]>([]);
    const [allDevices, setAllDevices] = useState<Device[]>([]);
    const [editForm, setEditForm] = useState<EditForm>();
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');
    const [editSaved, setEditSaved] = useState(false);
    const [resetQuotaBusy, setResetQuotaBusy] = useState(false);
    const [resetQuotaError, setResetQuotaError] = useState('');

    const [newPasswordInput, setNewPasswordInput] = useState('');
    const [passwordBusy, setPasswordBusy] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSaved, setPasswordSaved] = useState(false);

    const [sessions, setSessions] = useState<CrewSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [sessionsError, setSessionsError] = useState('');
    const [disconnectBusyId, setDisconnectBusyId] = useState<string>();
    const [disconnectFeedback, setDisconnectFeedback] = useState<string>();

    const [crewUser, setCrewUser] = useState<CrewUser>();
    const [crewUserLoading, setCrewUserLoading] = useState(false);
    const [crewUserError, setCrewUserError] = useState('');

    const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState('');

    const fetchData = useCallback(async () => {
        if (!subscriberId) return;
        setLoading(true);
        setError('');
        try {
            const [sub, pkgListRes, deviceListRes] = await Promise.all([
                SubscribersService.getSubscribers1({ subscriberId }),
                PackagesService.getPackages({}),
                InventoryService.getDevices({}),
            ]);
            setSubscriber(sub.data);
            setAllPackages(pkgListRes.data ?? []);
            setAllDevices(deviceListRes.data ?? []);
            setEditForm({
                display_name: sub.data?.display_name ?? '',
                notes: sub.data?.notes ?? '',
                package_id: sub.data?.package_id ?? '',
                nas_device_id: sub.data?.nas_device_id ?? '',
                expires_at: sub.data?.expires_at ? sub.data.expires_at.slice(0, 10) : '',
                status: sub.data?.status,
            });
            const [pkgRes, tenantRes] = await Promise.all([
                sub.data?.package_id ? PackagesService.getPackages1({ packageId: sub.data.package_id }) : Promise.resolve(undefined),
                sub.data?.tenant_id ? TenantsService.getTenants1({ tenantId: sub.data.tenant_id }) : Promise.resolve(undefined),
            ]);
            setPkg(pkgRes?.data);
            setTenant(tenantRes?.data);
            setDevice((deviceListRes.data ?? []).find(d => d.id === sub.data?.nas_device_id));
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setLoading(false);
        }
    }, [subscriberId]);

    const saveEdit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subscriberId || !editForm) return;
        setEditSaving(true);
        setEditError('');
        setEditSaved(false);
        try {
            await SubscribersService.patchSubscribers({
                subscriberId,
                requestBody: {
                    display_name: editForm.display_name || null,
                    notes: editForm.notes || null,
                    package_id: editForm.package_id || undefined,
                    nas_device_id: editForm.nas_device_id || null,
                    expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : undefined,
                    status: editForm.status,
                },
            });
            setEditSaved(true);
            setTimeout(() => setEditSaved(false), 2500);
            await fetchData();
        } catch (requestError) {
            setEditError(getApiErrorInfo(requestError).message);
        } finally {
            setEditSaving(false);
        }
    }, [subscriberId, editForm, fetchData]);

    const resetQuota = useCallback(async () => {
        if (!subscriberId) return;
        if (!window.confirm('Reset dung lượng đã dùng về 0 cho user này?')) return;
        setResetQuotaBusy(true);
        setResetQuotaError('');
        try {
            await SubscribersService.postSubscribersResetQuota({ subscriberId });
            await fetchData();
        } catch (requestError) {
            setResetQuotaError(getApiErrorInfo(requestError).message);
        } finally {
            setResetQuotaBusy(false);
        }
    }, [subscriberId, fetchData]);

    const deleteThisSubscriber = useCallback(async () => {
        if (!subscriberId || !subscriber) return;
        if (!window.confirm(`Xoá user "${subscriber.username}"? Toàn bộ mật khẩu, phiên đăng nhập và lịch sử sử dụng gắn với user này sẽ không còn hiển thị ở đâu nữa.`)) return;
        setDeleteBusy(true);
        setDeleteError('');
        try {
            await SubscribersService.deleteSubscribers({ subscriberId });
            navigate('/users');
        } catch (requestError) {
            setDeleteError(getApiErrorInfo(requestError).message);
            setDeleteBusy(false);
        }
    }, [subscriberId, subscriber, navigate]);

    const fetchSessions = useCallback(async (shipId: string, username: string) => {
        setSessionsLoading(true);
        setSessionsError('');
        try {
            const res = await CrewService.getShipsCrewUsersSessions({ shipId, username });
            setSessions(res.data?.sessions ?? []);
        } catch (requestError) {
            setSessions([]);
            setSessionsError(getApiErrorInfo(requestError).message);
        } finally {
            setSessionsLoading(false);
        }
    }, []);

    // service_usage/domain_usage (traffic flow phan loai qua NetFlow+DNS) chi co o
    // GET ships/{shipId}/crew/users, khong co o Subscriber/Package -- goi rieng, mac dinh 30 ngay
    // (khong dung 24h mac dinh cua API vi user co the it hoat dong gan day, se ra rong sai su that).
    const fetchCrewUser = useCallback(async (shipId: string, username: string) => {
        setCrewUserLoading(true);
        setCrewUserError('');
        try {
            const to = new Date();
            const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
            const res = await CrewService.getShipsCrewUsers({ shipId, from: from.toISOString(), to: to.toISOString() });
            setCrewUser((res.data?.users ?? []).find(u => u.username === username));
        } catch (requestError) {
            setCrewUser(undefined);
            setCrewUserError(getApiErrorInfo(requestError).message);
        } finally {
            setCrewUserLoading(false);
        }
    }, []);

    const fetchAudit = useCallback(async (id: string) => {
        setAuditLoading(true);
        setAuditError('');
        try {
            const res = await AuditService.getAuditLogs({ resourceType: 'subscriber', resourceId: id, limit: 100 });
            setAuditEntries(res.data ?? []);
        } catch (requestError) {
            setAuditEntries([]);
            setAuditError(getApiErrorInfo(requestError).message);
        } finally {
            setAuditLoading(false);
        }
    }, []);

    const setPassword = useCallback(async () => {
        if (!subscriberId || newPasswordInput.length < 4) return;
        setPasswordBusy(true);
        setPasswordError('');
        try {
            await SubscribersService.postSubscribersPassword({ subscriberId, requestBody: { password: newPasswordInput } });
            setNewPasswordInput('');
            setPasswordSaved(true);
            setTimeout(() => setPasswordSaved(false), 2500);
            const fresh = await SubscribersService.getSubscribers1({ subscriberId });
            setSubscriber(fresh.data);
        } catch (requestError) {
            setPasswordError(getApiErrorInfo(requestError).message);
        } finally {
            setPasswordBusy(false);
        }
    }, [subscriberId, newPasswordInput]);

    const revokePassword = useCallback(async () => {
        if (!subscriberId) return;
        setPasswordBusy(true);
        setPasswordError('');
        try {
            await SubscribersService.deleteSubscribersPassword({ subscriberId });
            const fresh = await SubscribersService.getSubscribers1({ subscriberId });
            setSubscriber(fresh.data);
        } catch (requestError) {
            setPasswordError(getApiErrorInfo(requestError).message);
        } finally {
            setPasswordBusy(false);
        }
    }, [subscriberId]);

    const disconnectSession = useCallback(async (session: CrewSession) => {
        if (!device?.ship_id || !subscriber?.username || !session.id) return;
        setDisconnectBusyId(session.id);
        setDisconnectFeedback(undefined);
        try {
            const res = await CrewService.postShipsCrewUsersSessionsDisconnect({ shipId: device.ship_id, username: subscriber.username, sessionId: session.id });
            setDisconnectFeedback((res.data as { message?: string } | undefined)?.message ?? 'Đã gửi yêu cầu ngắt.');
            await fetchSessions(device.ship_id, subscriber.username);
        } catch (requestError) {
            setDisconnectFeedback(getApiErrorInfo(requestError).message);
        } finally {
            setDisconnectBusyId(undefined);
        }
    }, [device, subscriber, fetchSessions]);

    // Nạp lịch sử phiên RADIUS + traffic flow thật ngay khi biết đủ (ship_id qua NAS + username) —
    // hai dữ liệu này chỉ có sau khi fetchData() xong, nên tách thành effect riêng.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => {
        if (device?.ship_id && subscriber?.username) {
            void fetchSessions(device.ship_id, subscriber.username);
            void fetchCrewUser(device.ship_id, subscriber.username);
        }
    }, [device?.ship_id, subscriber?.username, fetchSessions, fetchCrewUser]);

    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchData(); }, [fetchData]);

    // Lich su hoat dong khong phu thuoc NAS/ship_id (khac sessions/crewUser) -- nap ngay khi biet
    // subscriberId, tach rieng effect de khong phai cho device resolve xong.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { if (subscriberId) void fetchAudit(subscriberId); }, [subscriberId, fetchAudit]);

    const used = formatBytes(subscriber?.quota_used_bytes);
    const quotaBytes = (pkg?.quota_gb ?? 0) * 1000 * 1000 * 1000;
    const usedPct = subscriber?.quota_used_bytes && quotaBytes ? Math.min(100, (subscriber.quota_used_bytes / quotaBytes) * 100) : 0;
    const quotaStatus = usedPct > 90 ? 'critical' : usedPct > 70 ? 'warning' : 'healthy';
    const quotaChartColor = usedPct > 90 ? 'var(--danger)' : usedPct > 70 ? 'var(--warning)' : 'var(--success)';
    const quotaChartData = quotaBytes > 0 && subscriber?.quota_used_bytes != null
        ? [{ name: 'Đã dùng', value: subscriber.quota_used_bytes }, { name: 'Còn lại', value: Math.max(0, quotaBytes - subscriber.quota_used_bytes) }]
        : [];

    const sessionChartData = [...sessions]
        .filter(s => s.start_time)
        .sort((a, b) => new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime())
        .map(s => ({
            time: new Date(s.start_time as string).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
            download_mb: s.download_bytes != null ? Number((s.download_bytes / 1_000_000).toFixed(2)) : 0,
            upload_mb: s.upload_bytes != null ? Number((s.upload_bytes / 1_000_000).toFixed(2)) : 0,
        }));

    // Gop theo ngay (khac voi sessionChartData tren -- moi phien la 1 cot) de co 1 diem/ngay, dung
    // cho bieu do cot xu huong (Tong quan), bieu do line toc do trung binh (Tong quan) va bieu do
    // so phien/ngay (Phien dang nhap). Toc do = tong byte That * 8 / tong session_time_s That trong
    // ngay -- suy tu 2 truong RADIUS that (khong phai so bia dat), cung cach bytesToRateBps() dung
    // o cac trang khac, chi khac la gop theo ngay thay vi theo bucket thoi gian co dinh.
    const dailyBuckets = new Map<string, { date: string; sortKey: number; sessionCount: number; totalMb: number; totalBytes: number; totalSeconds: number }>();
    [...sessions]
        .filter(s => s.start_time)
        .sort((a, b) => new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime())
        .forEach(s => {
            const d = new Date(s.start_time as string);
            const key = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            const existing = dailyBuckets.get(key) ?? { date: key, sortKey: d.getTime(), sessionCount: 0, totalMb: 0, totalBytes: 0, totalSeconds: 0 };
            const sessionBytes = (s.download_bytes ?? 0) + (s.upload_bytes ?? 0);
            existing.sessionCount += 1;
            existing.totalMb += sessionBytes / 1_000_000;
            existing.totalBytes += sessionBytes;
            existing.totalSeconds += s.session_time_s ?? 0;
            dailyBuckets.set(key, existing);
        });
    const dailyUsageData = [...dailyBuckets.values()].sort((a, b) => a.sortKey - b.sortKey).map(d => ({ date: d.date, total_mb: Number(d.totalMb.toFixed(2)) }));
    const dailySpeedData = [...dailyBuckets.values()].sort((a, b) => a.sortKey - b.sortKey).map(d => ({ date: d.date, avg_mbps: d.totalSeconds > 0 ? Number(((d.totalBytes * 8) / d.totalSeconds / 1_000_000).toFixed(2)) : null }));
    const sessionsPerDayData = [...dailyBuckets.values()].sort((a, b) => a.sortKey - b.sortKey).map(d => ({ date: d.date, count: d.sessionCount }));

    const serviceRows = usageRows(crewUser?.service_usage, 'app', 8);
    const domainRows = usageRows(crewUser?.domain_usage, 'domain', 10);
    const speedChartData = [{ name: 'Download', mbps: pkg?.down_mbps ?? 0 }, { name: 'Upload', mbps: pkg?.up_mbps ?? 0 }];

    // So lieu KPI dat canh tieu de bieu do -- MOI SO deu suy tu du lieu that da tinh o tren
    // (dailyUsageData/dailySpeedData/sessionsPerDayData), khong goi API rieng, khong bia dat.
    const usageTotalMb = dailyUsageData.reduce((sum, d) => sum + d.total_mb, 0);
    const usageLast7Mb = dailyUsageData.slice(-7).reduce((sum, d) => sum + d.total_mb, 0);
    const usagePrev7Mb = dailyUsageData.slice(-14, -7).reduce((sum, d) => sum + d.total_mb, 0);
    // Chi tinh % so sanh khi co du 7 ngay LIEN TRUOC do de so sanh (usagePrev7Mb > 0) -- neu
    // subscriber moi dung <14 ngay, khong hien % de tranh chia cho 0 hoac % gia tao.
    const usageTrendPct = usagePrev7Mb > 0 ? Math.round(((usageLast7Mb - usagePrev7Mb) / usagePrev7Mb) * 1000) / 10 : null;

    const validSpeedDays = dailySpeedData.filter((d): d is { date: string; avg_mbps: number } => d.avg_mbps !== null);
    const speedToday = validSpeedDays.length > 0 ? validSpeedDays[validSpeedDays.length - 1].avg_mbps : null;
    const speedLast7 = validSpeedDays.slice(-7);
    const speedLast7Avg = speedLast7.length > 0 ? speedLast7.reduce((sum, d) => sum + d.avg_mbps, 0) / speedLast7.length : null;

    const sessionsTotal30d = sessionsPerDayData.reduce((sum, d) => sum + d.count, 0);
    const serviceClassifiedBytes = serviceRows.reduce((sum, r) => sum + r.bytes, 0);
    const sessionsDownloadTotalMb = sessionChartData.reduce((sum, s) => sum + s.download_mb, 0);
    const sessionsUploadTotalMb = sessionChartData.reduce((sum, s) => sum + s.upload_mb, 0);

    // MAC "gan nhat" -- suy tu phien RADIUS gan nhat CO ghi calling_station_mac that, KHONG phai 1
    // truong MAC tinh/khoa rieng cua subscriber (chua co enforcement nao cho dieu do o RADIUS server
    // nay). Chi la thong tin tham khao "thiet bi nao vua dang nhap", co the doi qua tung phien.
    const latestMacSession = [...sessions].filter(s => s.calling_station_mac).sort((a, b) => new Date(b.start_time ?? 0).getTime() - new Date(a.start_time ?? 0).getTime())[0];

    return (
        <div>
            <div className="top-bar">
                <div><Link to="/users" className="muted-text">← Quay lại danh sách user</Link></div>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được thông tin user" description={error} onRetry={() => void fetchData()} />}

            {loading && !subscriber ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải chi tiết user…</span></div>
            ) : subscriber ? (
                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.25rem', alignItems: 'start' }}>
                    <aside className="glass-panel dashboard-section" style={{ position: 'sticky', top: 12 }}>
                        <div className="section-heading"><div><h2>👤 Thông tin người dùng</h2></div></div>
                        {editForm && (
                            <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div className="settings-field"><label>Username</label><strong>{subscriber.username}</strong></div>
                                <div className="settings-field"><label>Tên hiển thị</label><input className="filter-select" value={editForm.display_name} onChange={e => setEditForm({ ...editForm, display_name: e.target.value })} placeholder="vd: Nguyễn Văn A" /></div>
                                <div className="settings-field"><label>Nhóm</label><strong>{tenant?.name ?? 'Không rõ'}</strong></div>
                                <div className="settings-field"><label>Gói cước</label>
                                    <select className="filter-select" value={editForm.package_id} onChange={e => setEditForm({ ...editForm, package_id: e.target.value })}>
                                        {allPackages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="settings-field"><label>MikroTik (NAS)</label>
                                    <select className="filter-select" value={editForm.nas_device_id} onChange={e => setEditForm({ ...editForm, nas_device_id: e.target.value })}>
                                        <option value="">-- chưa gán --</option>
                                        {allDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div className="settings-field"><label>Thời hạn</label>
                                    <input type="date" className="filter-select" value={editForm.expires_at} onChange={e => setEditForm({ ...editForm, expires_at: e.target.value })} />
                                </div>
                                <div className="settings-field"><label>Trạng thái</label>
                                    <select className="filter-select" value={editForm.status ?? 'ACTIVE'} onChange={e => setEditForm({ ...editForm, status: e.target.value as EditForm['status'] })}>
                                        <option value="ACTIVE">ACTIVE</option>
                                        <option value="SUSPENDED">SUSPENDED (tạm khoá)</option>
                                        <option value="EXPIRED">EXPIRED</option>
                                    </select>
                                </div>
                                <div className="settings-field"><label>MAC gần nhất</label><strong>{latestMacSession?.calling_station_mac ?? 'Chưa ghi nhận'}</strong></div>
                                <div className="settings-field"><label>Ghi chú</label><textarea className="filter-select" rows={2} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Ghi chú nội bộ..." /></div>
                                {editError && <DataStateNotice dataStatus="UNAVAILABLE" title="Lưu thất bại" description={editError} />}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button type="submit" className="filter-apply" disabled={editSaving}>{editSaving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
                                    {editSaved && <span className="muted-text" style={{ color: 'var(--success)' }}>Đã lưu ✓</span>}
                                </div>
                            </form>
                        )}

                        <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
                            <div className="settings-field" style={{ marginBottom: 8 }}>
                                <label>Mật khẩu</label>
                                {subscriber.password_configured ? <strong>•••••••• (đã đặt)</strong> : <span className="muted-text">Chưa đặt</span>}
                            </div>
                            <div className="settings-field" style={{ marginBottom: 6 }}>
                                <label>Đặt mật khẩu mới</label>
                                <input className="filter-select" type="text" minLength={4} value={newPasswordInput} onChange={e => setNewPasswordInput(e.target.value)} placeholder="Tối thiểu 4 ký tự" />
                            </div>
                            {passwordError && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{passwordError}</p>}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <button type="button" className="button-secondary compact-button" disabled={passwordBusy || newPasswordInput.length < 4} onClick={() => void setPassword()}>{passwordBusy ? 'Đang lưu…' : 'Lưu mật khẩu'}</button>
                                {subscriber.password_configured && <button type="button" className="button-secondary compact-button" disabled={passwordBusy} onClick={() => void revokePassword()}>Thu hồi</button>}
                                {passwordSaved && <span className="muted-text" style={{ color: 'var(--success)' }}>Đã lưu ✓</span>}
                            </div>
                        </div>

                        {deleteError && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{deleteError}</p>}
                        <button type="button" className="button-secondary compact-button" disabled={deleteBusy} onClick={() => void deleteThisSubscriber()} style={{ color: 'var(--danger)', borderColor: 'var(--danger)', marginTop: 14, width: '100%' }}>
                            {deleteBusy ? 'Đang xoá…' : '🗑 Xoá user'}
                        </button>
                    </aside>

                    <main style={{ minWidth: 0 }}>
                        <div className="tab-row" role="tablist">
                            {detailTabs.map(tab => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
                        </div>

                        {activeTab === 'Tổng quan' && (
                            <>
                            <div className="two-column-sections" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem' }}>
                                <section className="glass-panel dashboard-section" style={{ gridRow: '1 / 3' }}>
                                    <div className="section-heading">
                                        <div><h2>Data đã dùng</h2><p>Chu kỳ hiện tại · subscribers.quota_used_bytes</p></div>
                                    </div>
                                    {quotaChartData.length === 0 ? (
                                        <div className="empty-state">Chưa có thông tin quota để vẽ biểu đồ.</div>
                                    ) : (
                                        <div className="donut-wrap" style={{ width: 180, height: 180, margin: '0 auto' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={quotaChartData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} startAngle={90} endAngle={-270} stroke="none">
                                                        <Cell fill={quotaChartColor} />
                                                        <Cell fill="var(--border)" />
                                                    </Pie>
                                                    <Tooltip formatter={(v) => `${formatBytes(Number(v)).value} ${formatBytes(Number(v)).unit}`} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="donut-center-label">
                                                <span className="donut-center-value">{usedPct.toFixed(0)}%</span>
                                                <span className="donut-center-caption">{used.value} {used.unit} / {pkg?.quota_gb ?? '?'} GB</span>
                                            </div>
                                        </div>
                                    )}
                                    {quotaChartData.length > 0 && (
                                        <div className="chip-list" style={{ justifyContent: 'center', marginTop: 10 }}>
                                            <span className="usage-chip"><span style={{ width: 8, height: 8, borderRadius: '50%', background: quotaChartColor, display: 'inline-block' }} /> Đã dùng <strong>{used.value} {used.unit}</strong></span>
                                            <span className="usage-chip"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border)', display: 'inline-block' }} /> Còn lại <strong>{formatBytes(Math.max(0, quotaBytes - (subscriber?.quota_used_bytes ?? 0))).value} {formatBytes(Math.max(0, quotaBytes - (subscriber?.quota_used_bytes ?? 0))).unit}</strong></span>
                                        </div>
                                    )}
                                    <p className="muted-text" style={{ textAlign: 'center', marginTop: 8 }}>
                                        <span className={`status-dot ${quotaStatus}`}>{quotaStatus === 'critical' ? 'Gần hết quota' : quotaStatus === 'warning' ? 'Đang dùng nhiều' : 'Còn nhiều dung lượng'}</span>
                                    </p>
                                    {resetQuotaError && <p style={{ color: 'var(--danger)', fontSize: 12, textAlign: 'center' }}>{resetQuotaError}</p>}
                                    <div style={{ textAlign: 'center', marginTop: 8 }}>
                                        <button type="button" className="button-secondary compact-button" disabled={resetQuotaBusy} onClick={() => void resetQuota()}>{resetQuotaBusy ? 'Đang reset…' : 'Reset dung lượng'}</button>
                                    </div>
                                </section>

                                <section className="glass-panel dashboard-section">
                                    <div className="section-heading">
                                        <div><h2>Xu hướng dùng data</h2><p>Tổng download+upload mỗi ngày, từ lịch sử phiên RADIUS 30 ngày gần nhất.</p></div>
                                        {dailyUsageData.length > 0 && (
                                            <div className="chart-kpi-row">
                                                <div className="chart-kpi"><span className="chart-kpi-label">Tổng 30 ngày</span><span className="chart-kpi-value">{usageTotalMb.toFixed(1)} MB</span></div>
                                                {usageTrendPct !== null && (
                                                    <div className="chart-kpi"><span className="chart-kpi-label">So với 7 ngày trước</span><span className={`chart-kpi-value ${usageTrendPct >= 0 ? 'positive' : 'negative'}`}>{usageTrendPct >= 0 ? '+' : ''}{usageTrendPct}%</span></div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {dailyUsageData.length === 0 ? (
                                        <div className="empty-state">Chưa có phiên nào để vẽ xu hướng.</div>
                                    ) : (
                                        <div style={{ width: '100%', height: 160 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={dailyUsageData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="date" fontSize={11} />
                                                    <YAxis fontSize={11} unit=" MB" width={56} />
                                                    <Tooltip formatter={(v) => `${Number(v).toFixed(1)} MB`} />
                                                    <Bar dataKey="total_mb" name="Data/ngày" fill="#009688" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </section>

                                <section className="glass-panel dashboard-section">
                                    <div className="section-heading">
                                        <div><h2>Tốc độ trung bình theo ngày</h2><p>Tổng byte thật × 8 ÷ tổng session_time_s thật trong ngày — không phải tốc độ cam kết của gói.</p></div>
                                        {validSpeedDays.length > 0 && (
                                            <div className="chart-kpi-row">
                                                <div className="chart-kpi"><span className="chart-kpi-label">Hôm nay</span><span className="chart-kpi-value">{speedToday?.toFixed(1)} Mbps</span></div>
                                                {speedLast7Avg !== null && (
                                                    <div className="chart-kpi"><span className="chart-kpi-label">TB 7 ngày</span><span className="chart-kpi-value">{speedLast7Avg.toFixed(1)} Mbps</span></div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {dailySpeedData.filter(d => d.avg_mbps !== null).length === 0 ? (
                                        <div className="empty-state">Chưa đủ dữ liệu thời lượng phiên để tính tốc độ.</div>
                                    ) : (
                                        <div style={{ width: '100%', height: 160 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={dailySpeedData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="date" fontSize={11} />
                                                    <YAxis fontSize={11} unit=" Mbps" width={56} />
                                                    <Tooltip formatter={(v) => `${Number(v).toFixed(2)} Mbps`} />
                                                    <Line type="monotone" dataKey="avg_mbps" name="Tốc độ TB" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </section>
                            </div>

                            <AwaitingContract
                                title="Lịch sử thanh toán chưa có dữ liệu thật"
                                endpoint="Cần domain billing/hoá đơn riêng (Phase 2)"
                                detail="Mua thêm data / thanh toán trong thiết kế tham khảo là mô phỏng phía client; chưa có API thanh toán thật."
                            />
                        </>
                    )}

                    {activeTab === 'Gói cước' && (
                        pkg ? (
                            <>
                                <div className="mini-stat-row" style={{ marginTop: 16 }}>
                                    <MiniStat label="Tốc độ" value={`↓${pkg.down_mbps ?? '?'}/↑${pkg.up_mbps ?? '?'}`} unit="Mbps" status="healthy" />
                                    <MiniStat label="Quota" value={pkg.quota_gb ?? '?'} unit="GB/chu kỳ" status="healthy" />
                                    <MiniStat label="Thời hạn" value={pkg.duration_value ?? '?'} unit={pkg.duration_unit === 'DAY' ? 'ngày' : 'tháng'} status="healthy" />
                                    <MiniStat label="Giá gói" value={formatVnd(pkg.price_vnd)} status="healthy" />
                                    <MiniStat label="Thiết bị đồng thời" value={pkg.max_concurrent_devices ?? 1} unit="tối đa" status="healthy" />
                                </div>

                                <section className="glass-panel dashboard-section">
                                    <div className="section-heading"><div><h2>Tốc độ cam kết</h2><p>Download vs upload theo gói (Mbps).</p></div></div>
                                    <div style={{ width: '100%', height: 120 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={speedChartData} layout="vertical" margin={{ left: 8 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                                <XAxis type="number" fontSize={11} unit=" Mbps" />
                                                <YAxis type="category" dataKey="name" fontSize={12} width={80} />
                                                <Tooltip formatter={(v) => `${Number(v)} Mbps`} />
                                                <Bar dataKey="mbps" radius={[0, 6, 6, 0]}>
                                                    <Cell fill="#009688" />
                                                    <Cell fill="#3b82f6" />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </section>

                                <section className="glass-panel dashboard-section">
                                    <div className="section-heading"><div><h2>Phạm vi áp dụng</h2></div></div>
                                    <div className="dashboard-meta">
                                        <span><strong>Loại gói:</strong> {pkg.tenant_id ? 'Riêng cho 1 đại lý' : 'Dùng chung mọi đại lý (kế thừa)'}</span>
                                        <span><strong>Số subscriber đang dùng gói này:</strong> {formatCount(pkg.subscriber_count)}</span>
                                        <span><Link to="/packages">Xem tất cả gói cước →</Link></span>
                                    </div>
                                </section>
                            </>
                        ) : (
                            <div className="empty-state">Không tìm thấy thông tin gói cước.</div>
                        )
                    )}

                    {activeTab === 'Sử dụng' && (
                        <>
                            {!device?.ship_id ? (
                                <p className="muted-text" style={{ marginTop: 16 }}>Subscriber chưa gán NAS — không xác định được tàu nào để tra dữ liệu sử dụng.</p>
                            ) : crewUserError ? (
                                <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được dữ liệu sử dụng" description={crewUserError} onRetry={() => void fetchCrewUser(device.ship_id!, subscriber.username!)} />
                            ) : crewUserLoading ? (
                                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải dữ liệu sử dụng…</span></div>
                            ) : (
                                <>
                                    <section className="glass-panel dashboard-section" style={{ marginTop: 16 }}>
                                        <div className="section-heading">
                                            <div><h2>Dữ liệu theo phiên (30 ngày gần nhất)</h2><p>Download/upload thật của từng phiên RADIUS, xếp theo thời gian bắt đầu.</p></div>
                                            {sessionChartData.length > 0 && (
                                                <div className="chart-kpi-row">
                                                    <div className="chart-kpi"><span className="chart-kpi-label">Download</span><span className="chart-kpi-value">{sessionsDownloadTotalMb.toFixed(1)} MB</span></div>
                                                    <div className="chart-kpi"><span className="chart-kpi-label">Upload</span><span className="chart-kpi-value">{sessionsUploadTotalMb.toFixed(1)} MB</span></div>
                                                </div>
                                            )}
                                        </div>
                                        {sessionChartData.length === 0 ? (
                                            <div className="empty-state">Chưa có phiên nào trong 30 ngày gần đây để vẽ biểu đồ.</div>
                                        ) : (
                                            <div style={{ width: '100%', height: 220 }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={sessionChartData}>
                                                        <defs>
                                                            <linearGradient id="subDownloadGrad" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#009688" stopOpacity={0.35} />
                                                                <stop offset="95%" stopColor="#009688" stopOpacity={0} />
                                                            </linearGradient>
                                                            <linearGradient id="subUploadGrad" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" />
                                                        <XAxis dataKey="time" fontSize={11} />
                                                        <YAxis fontSize={11} unit=" MB" />
                                                        <Tooltip formatter={(v) => `${Number(v).toFixed(1)} MB`} />
                                                        <Legend />
                                                        <Area type="monotone" dataKey="download_mb" name="Download" stroke="#009688" fill="url(#subDownloadGrad)" />
                                                        <Area type="monotone" dataKey="upload_mb" name="Upload" stroke="#3b82f6" fill="url(#subUploadGrad)" />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </section>

                                    <section className="glass-panel dashboard-section">
                                        <div className="section-heading">
                                            <div><h2>Theo dịch vụ</h2><p>Phân loại qua NetFlow + DNS log — chỉ gồm lưu lượng đã khớp được tên miền và có trong danh mục dịch vụ.</p></div>
                                            {serviceRows.length > 0 && (
                                                <div className="chart-kpi-row">
                                                    <div className="chart-kpi"><span className="chart-kpi-label">Đã phân loại</span><span className="chart-kpi-value">{formatBytes(serviceClassifiedBytes).value} {formatBytes(serviceClassifiedBytes).unit}</span></div>
                                                </div>
                                            )}
                                        </div>
                                        {serviceRows.length === 0 ? (
                                            <div className="empty-state">Chưa có lưu lượng nào được phân loại theo dịch vụ trong 30 ngày gần đây.</div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <div style={{ width: 200, height: 200, flex: 'none' }}>
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie data={serviceRows} dataKey="bytes" nameKey="label" innerRadius={55} outerRadius={90} stroke="none">
                                                                {serviceRows.map((row, idx) => <Cell key={row.label} fill={SERVICE_COLORS[idx % SERVICE_COLORS.length]} />)}
                                                            </Pie>
                                                            <Tooltip formatter={(v) => `${formatBytes(Number(v)).value} ${formatBytes(Number(v)).unit}`} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <div className="chip-list" style={{ flex: 1, minWidth: 220 }}>
                                                    {serviceRows.map((row, idx) => (
                                                        <span className="usage-chip" key={row.label}>
                                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: SERVICE_COLORS[idx % SERVICE_COLORS.length], display: 'inline-block' }} />
                                                            {row.label} <strong>{formatBytes(row.bytes).value} {formatBytes(row.bytes).unit}</strong>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </section>

                                    <section className="glass-panel dashboard-section">
                                        <div className="section-heading"><div><h2>Theo tên miền</h2><p>Mọi domain đã phân giải qua DNS, kể cả chưa có trong danh mục dịch vụ (chi tiết hơn "Theo dịch vụ").</p></div><span>{formatCount(domainRows.length)} domain</span></div>
                                        {domainRows.length === 0 ? (
                                            <div className="empty-state">Chưa có domain nào được ghi nhận trong 30 ngày gần đây.</div>
                                        ) : (
                                            <div className="table-shell">
                                                <table className="data-table">
                                                    <thead><tr><th>Domain</th><th>Dữ liệu</th></tr></thead>
                                                    <tbody>{domainRows.map(row => <tr key={row.label}><td>{row.label}</td><td>{formatBytes(row.bytes).value} {formatBytes(row.bytes).unit}</td></tr>)}</tbody>
                                                </table>
                                            </div>
                                        )}
                                    </section>
                                </>
                            )}
                        </>
                    )}

                    {activeTab === 'Phiên đăng nhập' && (
                        <>
                            {sessionsPerDayData.length > 0 && (
                                <section className="glass-panel dashboard-section" style={{ marginTop: 16 }}>
                                    <div className="section-heading">
                                        <div><h2>Số phiên theo ngày</h2><p>Tần suất đăng nhập — mỗi lần Access-Accept + Accounting-Start mới tính là 1 phiên.</p></div>
                                        <div className="chart-kpi-row">
                                            <div className="chart-kpi"><span className="chart-kpi-label">Tổng 30 ngày</span><span className="chart-kpi-value">{formatCount(sessionsTotal30d)} phiên</span></div>
                                        </div>
                                    </div>
                                    <div style={{ width: '100%', height: 160 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={sessionsPerDayData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="date" fontSize={11} />
                                                <YAxis fontSize={11} allowDecimals={false} width={30} />
                                                <Tooltip formatter={(v) => `${v} phiên`} />
                                                <Bar dataKey="count" name="Phiên" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </section>
                            )}
                        <section className="glass-panel dashboard-section" style={{ marginTop: sessionsPerDayData.length > 0 ? 0 : 16 }}>
                            <div className="section-heading"><div><h2>Lịch sử phiên RADIUS</h2><p>Dữ liệu thật từ radius_sessions (yêu cầu NAS đã gán + router đã bật RADIUS accounting).</p></div><span>{formatCount(sessions.length)} phiên</span></div>
                            {!device?.ship_id ? (
                                <p className="muted-text">Subscriber chưa gán NAS — không xác định được tàu nào để tra phiên RADIUS.</p>
                            ) : sessionsError ? (
                                <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được phiên" description={sessionsError} onRetry={() => void fetchSessions(device.ship_id!, subscriber.username!)} />
                            ) : sessionsLoading ? (
                                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải phiên…</span></div>
                            ) : sessions.length === 0 ? (
                                <div className="empty-state">Chưa có phiên RADIUS nào cho user này.</div>
                            ) : (
                                <>
                                    {disconnectFeedback && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{disconnectFeedback}</p>}
                                    <div className="table-shell">
                                        <table className="data-table">
                                            <thead><tr><th>Trạng thái</th><th>IP</th><th>Bắt đầu</th><th>Data</th><th></th></tr></thead>
                                            <tbody>
                                                {sessions.map(session => (
                                                    <tr key={session.id}>
                                                        <td><span className={`status-dot ${session.status === 'ACTIVE' ? 'healthy' : session.status === 'STALE' ? 'warning' : 'unknown'}`}>{session.status}</span></td>
                                                        <td>{session.framed_ip ?? 'Chưa gán'}</td>
                                                        <td>{session.start_time ? new Date(session.start_time).toLocaleString('vi-VN') : 'Không rõ'}</td>
                                                        <td>{session.total_bytes !== null && session.total_bytes !== undefined ? `${formatBytes(session.total_bytes).value} ${formatBytes(session.total_bytes).unit}` : 'Chưa có'}</td>
                                                        <td>
                                                            {session.status === 'ACTIVE' && (
                                                                <button type="button" className="button-secondary compact-button" disabled={disconnectBusyId === session.id} onClick={() => void disconnectSession(session)}>
                                                                    {disconnectBusyId === session.id ? 'Đang ngắt…' : 'Ngắt phiên'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </section>
                        </>
                    )}

                    {activeTab === 'Lịch sử hoạt động' && (
                        <section className="glass-panel dashboard-section" style={{ marginTop: 16 }}>
                            <div className="section-heading"><div><h2>Lịch sử hoạt động</h2><p>Dữ liệu thật từ audit_logs — mọi thay đổi (tạo, sửa, đổi mật khẩu, reset dung lượng, xoá) trên tài khoản này.</p></div><span>{formatCount(auditEntries.length)} sự kiện</span></div>
                            {auditError ? (
                                <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được lịch sử hoạt động" description={auditError} onRetry={() => subscriberId && void fetchAudit(subscriberId)} />
                            ) : auditLoading ? (
                                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải lịch sử…</span></div>
                            ) : auditEntries.length === 0 ? (
                                <div className="empty-state">Chưa có sự kiện nào được ghi nhận cho user này.</div>
                            ) : (
                                <div className="table-shell">
                                    <table className="data-table">
                                        <thead><tr><th>Thời gian</th><th>Hành động</th><th>Người thực hiện</th><th>Kết quả</th></tr></thead>
                                        <tbody>
                                            {auditEntries.map(entry => (
                                                <tr key={entry.id}>
                                                    <td>{entry.created_at ? new Date(entry.created_at).toLocaleString('vi-VN') : 'Không rõ'}</td>
                                                    <td>{ACTION_LABELS[entry.action ?? ''] ?? entry.action ?? 'Không rõ'}</td>
                                                    <td>{entry.actor?.label ?? 'Không rõ'}</td>
                                                    <td><span className={`status-dot ${entry.result === 'SUCCESS' ? 'healthy' : 'critical'}`}>{entry.result}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )}
                    </main>
                </div>
            ) : (
                <div className="empty-state">Không tìm thấy user.</div>
            )}
        </div>
    );
};
