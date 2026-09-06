import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CrewService, InventoryService, PackagesService, SubscribersService, TenantsService } from '../api';
import type { Subscriber } from '../api/models/Subscriber';
import type { Package } from '../api/models/Package';
import type { Device } from '../api/models/Device';
import type { Tenant } from '../api/models/Tenant';
import type { CrewSession } from '../api/models/CrewSession';
import type { CrewUser } from '../api/models/CrewUser';
import { AwaitingContract, DataStateNotice } from '../components/DataStateNotice';
import { MiniStat } from '../components/MiniStat';
import { SecretReveal } from '../components/SecretReveal';
import { formatBytes, formatCount, formatVnd, getApiErrorInfo, isRecord } from '../lib/dashboard';

type DetailTab = 'Tổng quan' | 'Gói cước' | 'Sử dụng' | 'Phiên đăng nhập';
const detailTabs: DetailTab[] = ['Tổng quan', 'Gói cước', 'Sử dụng', 'Phiên đăng nhập'];
const SERVICE_COLORS = ['#009688', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899', '#84cc16'];

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

export const SubscriberDetail: React.FC = () => {
    const { subscriberId } = useParams<{ subscriberId: string }>();
    const [activeTab, setActiveTab] = useState<DetailTab>('Tổng quan');
    const [subscriber, setSubscriber] = useState<Subscriber>();
    const [pkg, setPkg] = useState<Package>();
    const [device, setDevice] = useState<Device>();
    const [tenant, setTenant] = useState<Tenant>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [issuedPassword, setIssuedPassword] = useState<string>();
    const [passwordBusy, setPasswordBusy] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [copyFeedback, setCopyFeedback] = useState<string>();

    const [sessions, setSessions] = useState<CrewSession[]>([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [sessionsError, setSessionsError] = useState('');
    const [disconnectBusyId, setDisconnectBusyId] = useState<string>();
    const [disconnectFeedback, setDisconnectFeedback] = useState<string>();

    const [crewUser, setCrewUser] = useState<CrewUser>();
    const [crewUserLoading, setCrewUserLoading] = useState(false);
    const [crewUserError, setCrewUserError] = useState('');

    const fetchData = useCallback(async () => {
        if (!subscriberId) return;
        setLoading(true);
        setError('');
        try {
            const sub = await SubscribersService.getSubscribers1({ subscriberId });
            setSubscriber(sub.data);
            const [pkgRes, tenantRes] = await Promise.all([
                sub.data?.package_id ? PackagesService.getPackages1({ packageId: sub.data.package_id }) : Promise.resolve(undefined),
                sub.data?.tenant_id ? TenantsService.getTenants1({ tenantId: sub.data.tenant_id }) : Promise.resolve(undefined),
            ]);
            setPkg(pkgRes?.data);
            setTenant(tenantRes?.data);
            if (sub.data?.nas_device_id) {
                const devices = await InventoryService.getDevices({});
                setDevice((devices.data ?? []).find(d => d.id === sub.data?.nas_device_id));
            }
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setLoading(false);
        }
    }, [subscriberId]);

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

    const copyText = useCallback(async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyFeedback(label);
            setTimeout(() => setCopyFeedback(undefined), 2000);
        } catch {
            setCopyFeedback(undefined);
        }
    }, []);

    const issuePassword = useCallback(async () => {
        if (!subscriberId) return;
        setPasswordBusy(true);
        setPasswordError('');
        try {
            const res = await SubscribersService.postSubscribersPassword({ subscriberId });
            setIssuedPassword(res.data?.password);
            const fresh = await SubscribersService.getSubscribers1({ subscriberId });
            setSubscriber(fresh.data);
        } catch (requestError) {
            setPasswordError(getApiErrorInfo(requestError).message);
        } finally {
            setPasswordBusy(false);
        }
    }, [subscriberId]);

    const revokePassword = useCallback(async () => {
        if (!subscriberId) return;
        setPasswordBusy(true);
        setPasswordError('');
        try {
            await SubscribersService.deleteSubscribersPassword({ subscriberId });
            setIssuedPassword(undefined);
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
    // cho sparkline xu huong (Tong quan) va bieu do so phien/ngay (Phien dang nhap).
    const dailyBuckets = new Map<string, { date: string; sortKey: number; sessionCount: number; totalMb: number }>();
    [...sessions]
        .filter(s => s.start_time)
        .sort((a, b) => new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime())
        .forEach(s => {
            const d = new Date(s.start_time as string);
            const key = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            const existing = dailyBuckets.get(key) ?? { date: key, sortKey: d.getTime(), sessionCount: 0, totalMb: 0 };
            existing.sessionCount += 1;
            existing.totalMb += ((s.download_bytes ?? 0) + (s.upload_bytes ?? 0)) / 1_000_000;
            dailyBuckets.set(key, existing);
        });
    const dailyUsageData = [...dailyBuckets.values()].sort((a, b) => a.sortKey - b.sortKey).map(d => ({ date: d.date, total_mb: Number(d.totalMb.toFixed(2)) }));
    const sessionsPerDayData = [...dailyBuckets.values()].sort((a, b) => a.sortKey - b.sortKey).map(d => ({ date: d.date, count: d.sessionCount }));

    const serviceRows = usageRows(crewUser?.service_usage, 'app', 8);
    const domainRows = usageRows(crewUser?.domain_usage, 'domain', 10);
    const speedChartData = [{ name: 'Download', mbps: pkg?.down_mbps ?? 0 }, { name: 'Upload', mbps: pkg?.up_mbps ?? 0 }];

    return (
        <div>
            <div className="top-bar">
                <div>
                    <Link to="/users" className="muted-text">← Quay lại danh sách user</Link>
                    <h1>{subscriber?.username ?? 'Chi tiết user'}</h1>
                    <p className="page-subtitle">{tenant?.name ?? 'Tenant'} · {subscriber?.auth_type ?? ''}</p>
                </div>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được thông tin user" description={error} onRetry={() => void fetchData()} />}

            {loading && !subscriber ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải chi tiết user…</span></div>
            ) : subscriber ? (
                <>
                    <div className="tab-row" role="tablist">
                        {detailTabs.map(tab => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
                    </div>

                    {activeTab === 'Tổng quan' && (
                        <>
                            <div className="mini-stat-row" style={{ marginTop: 16 }}>
                                <MiniStat label="Gói cước" value={pkg?.name ?? 'Không rõ'} status="healthy" />
                                <MiniStat label="Trạng thái tài khoản" value={subscriber.status ?? 'Không rõ'} status={subscriber.status === 'ACTIVE' ? 'healthy' : subscriber.status === 'SUSPENDED' ? 'warning' : 'critical'} />
                                <MiniStat label="Hết hạn" value={subscriber.expires_at ? new Date(subscriber.expires_at).toLocaleDateString('vi-VN') : 'Không rõ'} status={subscriber.status === 'EXPIRED' ? 'critical' : 'healthy'} />
                                <MiniStat label="Tenant" value={tenant?.name ?? 'Không rõ'} />
                                <MiniStat label="Loại xác thực" value={subscriber.auth_type ?? '—'} />
                                <MiniStat label="NAS" value={device?.name ?? 'Chưa gán'} />
                                <MiniStat label="Tạo lúc" value={subscriber.created_at ? new Date(subscriber.created_at).toLocaleDateString('vi-VN') : 'Không rõ'} />
                            </div>

                            <div className="two-column-sections">
                                <section className="glass-panel dashboard-section">
                                    <div className="section-heading"><div><h2>Data đã dùng</h2><p>Chu kỳ hiện tại · subscribers.quota_used_bytes</p></div></div>
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
                                    <p className="muted-text" style={{ textAlign: 'center', marginTop: 8 }}>
                                        <span className={`status-dot ${quotaStatus}`}>{quotaStatus === 'critical' ? 'Gần hết quota' : quotaStatus === 'warning' ? 'Đang dùng nhiều' : 'Còn nhiều dung lượng'}</span>
                                    </p>
                                </section>

                                <section className="glass-panel dashboard-section">
                                    <div className="section-heading"><div><h2>Xu hướng dùng data</h2><p>Tổng download+upload mỗi ngày, từ lịch sử phiên RADIUS 30 ngày gần nhất.</p></div></div>
                                    {dailyUsageData.length === 0 ? (
                                        <div className="empty-state">Chưa có phiên nào để vẽ xu hướng.</div>
                                    ) : (
                                        <div style={{ width: '100%', height: 180 }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={dailyUsageData}>
                                                    <defs>
                                                        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#009688" stopOpacity={0.4} />
                                                            <stop offset="95%" stopColor="#009688" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="date" fontSize={11} />
                                                    <YAxis fontSize={11} unit=" MB" width={56} />
                                                    <Tooltip formatter={(v) => `${Number(v).toFixed(1)} MB`} />
                                                    <Area type="monotone" dataKey="total_mb" name="Data/ngày" stroke="#009688" strokeWidth={2} fill="url(#trendGrad)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </section>
                            </div>

                            <section className="glass-panel dashboard-section">
                                <div className="section-heading"><div><h2>Mật khẩu đăng nhập Hotspot/PPPoE</h2><p>Username <code>{subscriber.username}</code> + mật khẩu này là thứ người dùng thật gõ vào trang login MikroTik — router xác thực trực tiếp qua RADIUS Access-Request (PAP) tới backend này.</p></div></div>
                                {issuedPassword ? (
                                    <SecretReveal
                                        heading="Mật khẩu thật — chỉ hiển thị MỘT LẦN DUY NHẤT, hãy gửi cho người dùng ngay:"
                                        value={issuedPassword}
                                        copied={copyFeedback === 'password'}
                                        onCopy={() => void copyText(issuedPassword, 'password')}
                                        caption="Rời khỏi trang này sẽ không xem lại được — nếu quên, cấp lại mật khẩu mới (mật khẩu cũ sẽ bị vô hiệu ngay)."
                                    />
                                ) : subscriber.password_configured ? (
                                    <p>Đã cấp — lúc {subscriber.password_issued_at ? new Date(subscriber.password_issued_at).toLocaleString('vi-VN') : 'không rõ'}. Server chỉ giữ bản băm (scrypt), không lưu mật khẩu thật.</p>
                                ) : (
                                    <p className="muted-text">Chưa cấp mật khẩu — user này sẽ bị Access-Reject nếu router gửi Access-Request lên ngay bây giờ.</p>
                                )}
                                {passwordError && <p style={{ color: '#dc2626', fontSize: 12 }}>{passwordError}</p>}
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    <button type="button" className="filter-apply" disabled={passwordBusy} onClick={() => void issuePassword()}>{passwordBusy ? 'Đang xử lý…' : subscriber.password_configured ? 'Cấp lại mật khẩu' : 'Cấp mật khẩu'}</button>
                                    {subscriber.password_configured && <button type="button" className="button-secondary compact-button" disabled={passwordBusy} onClick={() => void revokePassword()}>Thu hồi mật khẩu</button>}
                                </div>
                            </section>

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
                                        <div className="section-heading"><div><h2>Dữ liệu theo phiên (30 ngày gần nhất)</h2><p>Download/upload thật của từng phiên RADIUS, xếp theo thời gian bắt đầu.</p></div></div>
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
                                        <div className="section-heading"><div><h2>Theo dịch vụ</h2><p>Phân loại qua NetFlow + DNS log — chỉ gồm lưu lượng đã khớp được tên miền và có trong danh mục dịch vụ.</p></div></div>
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
                                    <div className="section-heading"><div><h2>Số phiên theo ngày</h2><p>Tần suất đăng nhập — mỗi lần Access-Accept + Accounting-Start mới tính là 1 phiên.</p></div></div>
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
                </>
            ) : (
                <div className="empty-state">Không tìm thấy user.</div>
            )}
        </div>
    );
};
