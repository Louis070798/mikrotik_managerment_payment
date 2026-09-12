import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Plus, X } from 'lucide-react';
import { ZeroTierService } from '../api';
import type { ZeroTierMember } from '../api/models/ZeroTierMember';
import type { ZeroTierNetworkDetail } from '../api/models/ZeroTierNetworkDetail';
import type { ZeroTierNetworkSummary } from '../api/models/ZeroTierNetworkSummary';
import { formatCount, getApiErrorInfo, type MetricStatus } from '../lib/dashboard';
import { useHeaderActions } from '../lib/headerActions';

/** Dòng cảnh báo nhỏ gọn — thay cho DataStateNotice to khi chỉ cần báo lỗi ngắn + nút thử lại. */
function InlineWarning({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <div className="inline-warning-line">
            <AlertTriangle size={14} />
            <span>{message}</span>
            {onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}
        </div>
    );
}

function authorizedBadge(authorized: boolean | null): { label: string; status: MetricStatus } {
    if (authorized === null) return { label: 'Không rõ', status: 'unknown' };
    return authorized ? { label: 'Đã cấp phép', status: 'healthy' } : { label: 'Chưa cấp phép', status: 'warning' };
}

/**
 * /peer chỉ là góc nhìn của CHÍNH controller (nó có đang liên lạc trực tiếp với thiết bị hay
 * không) -- KHÔNG phải góc nhìn toàn mạng. Sau khi 2 thiết bị đã bắt tay xong, traffic thật đi
 * trực tiếp giữa 2 máy (P2P), không qua controller nữa -- nên 1 thiết bị hoàn toàn online thật
 * (vd bạn ping được) vẫn có thể không có "path" nào tới controller lúc đó. Vì vậy KHÔNG khẳng
 * định "Offline" (dễ sai, đã xác nhận thật) -- chỉ 1 mức khẳng định chắc (đang thấy path active
 * that) + 2 mức "không có tín hiệu", không phải "chắc chắn tắt".
 */
function onlineBadge(online: boolean | null | undefined): { label: string; className: string } {
    if (online === true) return { label: 'Online', className: 'status-dot healthy pulse' };
    if (online === false) return { label: 'Không rõ (không có tín hiệu trực tiếp)', className: 'status-dot warning' };
    return { label: 'Chưa từng kết nối', className: 'status-dot' };
}

/** Nút sao chép nhỏ gọn cạnh 1 giá trị (Network ID, Node ID, IP...) — tự quản lý trạng thái "đã chép". */
function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard API có thể bị chặn (context không an toàn, thiếu quyền) -- bỏ qua lặng lẽ.
        }
    };
    return (
        <button type="button" className={`icon-copy-button${copied ? ' copied' : ''}`} onClick={() => void handleCopy()} title="Sao chép" aria-label="Sao chép">
            {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
    );
}

/** Ô thống kê nhỏ gọn — thay cho MetricCard to khi chỉ cần liếc nhanh 1 con số + nhãn. */
function StatChip({ label, value, status = 'unknown' }: { label: string; value: string; status?: MetricStatus }) {
    return (
        <div className={`stat-chip stat-chip-${status}`}>
            <span className="stat-chip-value">{value}</span>
            <span className="stat-chip-label">{label}</span>
        </div>
    );
}

/** Đếm số địa chỉ trong 1 dải IPv4 — dùng để cảnh báo dải quá lớn (xem ghi chú tại nơi dùng). */
function ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    return parts[0] * 16777216 + parts[1] * 65536 + parts[2] * 256 + parts[3];
}
function poolAddressCount(start: string, end: string): number | null {
    const s = ipv4ToInt(start);
    const e = ipv4ToInt(end);
    if (s === null || e === null || e < s) return null;
    return e - s + 1;
}

type PoolRow = { ip_range_start: string; ip_range_end: string };
type RouteRow = { target: string; via: string };
type EditForm = {
    name: string;
    private: boolean;
    autoAssignV4: boolean;
    pools: PoolRow[];
    routes: RouteRow[];
    dnsDomain: string;
    dnsServers: string;
};

const EMPTY_CREATE_FORM = { name: '', private: true };

function detailToEditForm(detail: ZeroTierNetworkDetail): EditForm {
    return {
        name: detail.name ?? '',
        private: detail.private ?? true,
        autoAssignV4: detail.auto_assign_v4 ?? false,
        pools: (detail.ip_assignment_pools ?? []).map(p => ({ ip_range_start: p.ip_range_start, ip_range_end: p.ip_range_end })),
        routes: (detail.routes ?? []).map(r => ({ target: r.target, via: r.via ?? '' })),
        dnsDomain: detail.dns?.domain ?? '',
        dnsServers: (detail.dns?.servers ?? []).join(', '),
    };
}

/**
 * ZeroTier — trang thật, gọi thẳng ZeroTier Controller API (qua backend proxy /zerotier/*, xem
 * modules/zerotier) — CRUD đầy đủ (tạo/sửa/xoá network, cấp phép/thu hồi/gán IP tay/xoá thành
 * viên), không phải chỉ đọc. Địa chỉ/secret controller KHÔNG cấu hình ở đây (ADR-04/05) — đăng ký
 * 1 lần qua POST /services/zerotier.controller/endpoints.
 */
export const VpnZeroTier: React.FC = () => {
    const [networks, setNetworks] = useState<ZeroTierNetworkSummary[]>([]);
    const [networksLoading, setNetworksLoading] = useState(true);
    const [networksError, setNetworksError] = useState<ReturnType<typeof getApiErrorInfo>>();

    const [selectedNetworkId, setSelectedNetworkId] = useState('');
    const [members, setMembers] = useState<ZeroTierMember[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [membersError, setMembersError] = useState<ReturnType<typeof getApiErrorInfo>>();

    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState<string>();

    const [editingNetworkId, setEditingNetworkId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<EditForm | null>(null);
    const [editLoading, setEditLoading] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string>();

    const [confirmDeleteNetworkId, setConfirmDeleteNetworkId] = useState<string | null>(null);
    const [confirmDeleteMemberId, setConfirmDeleteMemberId] = useState<string | null>(null);
    const [memberBusyId, setMemberBusyId] = useState<string | null>(null);
    const [editIpMemberId, setEditIpMemberId] = useState<string | null>(null);
    const [editIpValue, setEditIpValue] = useState('');
    const [editNameMemberId, setEditNameMemberId] = useState<string | null>(null);
    const [editNameValue, setEditNameValue] = useState('');

    const fetchNetworks = useCallback(async () => {
        setNetworksLoading(true);
        setNetworksError(undefined);
        try {
            const res = await ZeroTierService.getZerotierNetworks({});
            const list = res.data ?? [];
            setNetworks(list);
            setSelectedNetworkId(current => current || list[0]?.id || '');
        } catch (err) {
            setNetworks([]);
            setNetworksError(getApiErrorInfo(err));
        } finally {
            setNetworksLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // This effect synchronizes the page with the external API; its async callback owns loading/error state.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchNetworks(); }, [fetchNetworks]);

    const fetchMembers = useCallback(async (networkId: string) => {
        if (!networkId) { setMembers([]); return; }
        setMembersLoading(true);
        setMembersError(undefined);
        try {
            const res = await ZeroTierService.getZerotierNetworksMembers({ networkId });
            setMembers(res.data ?? []);
        } catch (err) {
            setMembers([]);
            setMembersError(getApiErrorInfo(err));
        } finally {
            setMembersLoading(false);
        }
    }, []);

    // This effect synchronizes the selected network with the external API.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { if (selectedNetworkId) void fetchMembers(selectedNetworkId); }, [selectedNetworkId, fetchMembers]);

    // Tự bỏ trạng thái "xác nhận xoá?" sau 4s nếu người dùng không bấm lần 2 — tránh treo nút ở
    // trạng thái nguy hiểm quá lâu.
    useEffect(() => {
        if (!confirmDeleteNetworkId) return;
        const t = setTimeout(() => setConfirmDeleteNetworkId(null), 4000);
        return () => clearTimeout(t);
    }, [confirmDeleteNetworkId]);
    useEffect(() => {
        if (!confirmDeleteMemberId) return;
        const t = setTimeout(() => setConfirmDeleteMemberId(null), 4000);
        return () => clearTimeout(t);
    }, [confirmDeleteMemberId]);

    const openEdit = useCallback(async (networkId: string) => {
        setEditingNetworkId(networkId);
        setEditLoading(true);
        setEditError(undefined);
        setEditForm(null);
        try {
            const res = await ZeroTierService.getZerotierNetworks1({ networkId });
            if (res.data) setEditForm(detailToEditForm(res.data));
        } catch (err) {
            setEditError(getApiErrorInfo(err).message);
        } finally {
            setEditLoading(false);
        }
    }, []);
    const closeEdit = () => { setEditingNetworkId(null); setEditForm(null); setEditError(undefined); };

    const openCreate = () => { setCreateForm(EMPTY_CREATE_FORM); setCreateError(undefined); setShowCreate(true); };
    const closeCreate = () => setShowCreate(false);

    const submitCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateBusy(true);
        setCreateError(undefined);
        try {
            const res = await ZeroTierService.postZerotierNetworks({ requestBody: { name: createForm.name, private: createForm.private } });
            setShowCreate(false);
            await fetchNetworks();
            const newId = res.data?.id;
            if (newId) {
                setSelectedNetworkId(newId);
                await openEdit(newId);
            }
        } catch (err) {
            setCreateError(getApiErrorInfo(err).message);
        } finally {
            setCreateBusy(false);
        }
    };

    const submitEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingNetworkId || !editForm) return;
        setEditSaving(true);
        setEditError(undefined);
        try {
            const servers = editForm.dnsServers.split(',').map(s => s.trim()).filter(Boolean);
            await ZeroTierService.patchZerotierNetworks({
                networkId: editingNetworkId,
                requestBody: {
                    name: editForm.name,
                    private: editForm.private,
                    auto_assign_v4: editForm.autoAssignV4,
                    ip_assignment_pools: editForm.pools.filter(p => p.ip_range_start && p.ip_range_end),
                    routes: editForm.routes.filter(r => r.target).map(r => ({ target: r.target, via: r.via || null })),
                    dns: editForm.dnsDomain ? { domain: editForm.dnsDomain, servers } : null,
                },
            });
            closeEdit();
            await fetchNetworks();
            if (selectedNetworkId === editingNetworkId) await fetchMembers(editingNetworkId);
        } catch (err) {
            setEditError(getApiErrorInfo(err).message);
        } finally {
            setEditSaving(false);
        }
    };

    const addPoolRow = () => setEditForm(f => f && { ...f, pools: [...f.pools, { ip_range_start: '', ip_range_end: '' }] });
    const removePoolRow = (i: number) => setEditForm(f => f && { ...f, pools: f.pools.filter((_, idx) => idx !== i) });
    const updatePoolRow = (i: number, field: keyof PoolRow, value: string) =>
        setEditForm(f => f && { ...f, pools: f.pools.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)) });

    const addRouteRow = () => setEditForm(f => f && { ...f, routes: [...f.routes, { target: '', via: '' }] });
    const removeRouteRow = (i: number) => setEditForm(f => f && { ...f, routes: f.routes.filter((_, idx) => idx !== i) });
    const updateRouteRow = (i: number, field: keyof RouteRow, value: string) =>
        setEditForm(f => f && { ...f, routes: f.routes.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)) });

    const handleDeleteNetworkClick = (networkId: string) => {
        if (!networkId) return;
        if (confirmDeleteNetworkId === networkId) {
            setConfirmDeleteNetworkId(null);
            void (async () => {
                try {
                    await ZeroTierService.deleteZerotierNetworks({ networkId });
                    if (selectedNetworkId === networkId) setSelectedNetworkId('');
                    await fetchNetworks();
                } catch (err) {
                    setNetworksError(getApiErrorInfo(err));
                }
            })();
        } else {
            setConfirmDeleteNetworkId(networkId);
        }
    };

    const toggleAuthorized = async (member: ZeroTierMember) => {
        if (!selectedNetworkId || !member.id) return;
        setMemberBusyId(member.id);
        try {
            await ZeroTierService.patchZerotierNetworksMembers({
                networkId: selectedNetworkId,
                memberId: member.id,
                requestBody: { authorized: !(member.authorized ?? false) },
            });
            await fetchMembers(selectedNetworkId);
        } catch (err) {
            setMembersError(getApiErrorInfo(err));
        } finally {
            setMemberBusyId(null);
        }
    };

    const openEditIp = (member: ZeroTierMember) => { setEditIpMemberId(member.id ?? null); setEditIpValue((member.ip_assignments ?? []).join(', ')); };
    const cancelEditIp = () => { setEditIpMemberId(null); setEditIpValue(''); };
    const saveEditIp = async (member: ZeroTierMember) => {
        if (!selectedNetworkId || !member.id) return;
        setMemberBusyId(member.id);
        try {
            const ips = editIpValue.split(',').map(s => s.trim()).filter(Boolean);
            await ZeroTierService.patchZerotierNetworksMembers({
                networkId: selectedNetworkId,
                memberId: member.id,
                requestBody: { ip_assignments: ips },
            });
            setEditIpMemberId(null);
            await fetchMembers(selectedNetworkId);
        } catch (err) {
            setMembersError(getApiErrorInfo(err));
        } finally {
            setMemberBusyId(null);
        }
    };

    const openEditName = (member: ZeroTierMember) => { setEditNameMemberId(member.id ?? null); setEditNameValue(member.name ?? ''); };
    const cancelEditName = () => { setEditNameMemberId(null); setEditNameValue(''); };
    const saveEditName = async (member: ZeroTierMember) => {
        if (!selectedNetworkId || !member.id) return;
        setMemberBusyId(member.id);
        try {
            await ZeroTierService.patchZerotierNetworksMembers({
                networkId: selectedNetworkId,
                memberId: member.id,
                requestBody: { name: editNameValue.trim() || null },
            });
            setEditNameMemberId(null);
            await fetchMembers(selectedNetworkId);
        } catch (err) {
            setMembersError(getApiErrorInfo(err));
        } finally {
            setMemberBusyId(null);
        }
    };

    const handleDeleteMemberClick = (member: ZeroTierMember) => {
        if (!selectedNetworkId || !member.id) return;
        if (confirmDeleteMemberId === member.id) {
            setConfirmDeleteMemberId(null);
            const memberId = member.id;
            setMemberBusyId(memberId);
            void (async () => {
                try {
                    await ZeroTierService.deleteZerotierNetworksMembers({ networkId: selectedNetworkId, memberId });
                    await fetchMembers(selectedNetworkId);
                } catch (err) {
                    setMembersError(getApiErrorInfo(err));
                } finally {
                    setMemberBusyId(null);
                }
            })();
        } else {
            setConfirmDeleteMemberId(member.id);
        }
    };

    const dataOk = !networksLoading && !networksError;
    const totalMembers = networks.reduce((sum, n) => sum + (n.member_count ?? 0), 0);
    const privateCount = networks.filter(n => n.private === true).length;
    const authorizedKnownTotal = networks.reduce((sum, n) => sum + (n.authorized_member_count ?? 0), 0);
    const authorizedKnownCount = networks.filter(n => n.authorized_member_count !== null && n.authorized_member_count !== undefined).length;
    const selectedNetwork = networks.find(n => n.id === selectedNetworkId);
    const authorizedMembers = members.filter(m => m.authorized === true).length;
    const onlineCount = members.filter(m => m.online).length;

    useHeaderActions(
        <button type="button" className="filter-apply" onClick={openCreate}><Plus size={14} /> Tạo network mới</button>,
        [],
    );

    return (
        <div>
            {networksError?.code === 'ZEROTIER_NOT_CONFIGURED' ? (
                <InlineWarning
                    message={`Chưa cấu hình ZeroTier controller: ${networksError.message} — đăng ký qua POST /api/v1/services/zerotier.controller/endpoints (service_type=ZEROTIER, host=10.149.79.186, port=9993, secret_ref="env:ZEROTIER_CONTROLLER_TOKEN").`}
                    onRetry={() => void fetchNetworks()}
                />
            ) : networksError ? (
                <InlineWarning message={`Không gọi được ZeroTier controller: ${networksError.message}`} onRetry={() => void fetchNetworks()} />
            ) : null}

            <div className="stat-chip-row">
                <StatChip label="Tổng network" value={dataOk ? formatCount(networks.length) : 'N/A'} status={dataOk ? 'healthy' : 'unknown'} />
                <StatChip label="Tổng thành viên" value={dataOk ? formatCount(totalMembers) : 'N/A'} status={dataOk ? 'healthy' : 'unknown'} />
                <StatChip label="Riêng tư" value={dataOk ? `${privateCount}/${networks.length}` : 'N/A'} status={dataOk ? 'healthy' : 'unknown'} />
                <StatChip label="Đã cấp phép" value={!dataOk ? 'N/A' : authorizedKnownCount > 0 ? formatCount(authorizedKnownTotal) : 'Không rõ'} status={dataOk && authorizedKnownCount > 0 ? 'healthy' : 'unknown'} />
            </div>

            <section className="glass-panel dashboard-section">
                <div className="section-heading"><div><h2>Danh sách network</h2><p>Chọn 1 network để xem chi tiết thành viên bên dưới.</p></div><span>{formatCount(networks.length)} network</span></div>
                {networksLoading ? (
                    <div className="loading-block"><div className="loading-spinner" /><span>Đang tải...</span></div>
                ) : (
                    <div className="table-shell">
                        <table className="data-table">
                            <thead><tr><th>Network ID</th><th>Tên</th><th>Loại</th><th>Thành viên</th><th>Đã cấp phép</th><th>Hành động</th></tr></thead>
                            <tbody>
                                {networks.map(network => (
                                    <tr key={network.id} style={network.id === selectedNetworkId ? { background: 'var(--surface-hover, rgba(0,150,136,0.08))' } : undefined}>
                                        <td><span className="copyable-value"><code>{network.id}</code><CopyButton value={network.id ?? ''} /></span></td>
                                        <td>{network.name ?? 'Chưa đặt tên'}</td>
                                        <td>{network.private === null ? 'Không rõ' : network.private ? 'Riêng tư' : 'Công khai'}</td>
                                        <td>{formatCount(network.member_count)}</td>
                                        <td>{network.authorized_member_count === null || network.authorized_member_count === undefined ? 'Không rõ' : formatCount(network.authorized_member_count)}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                <button type="button" className="button-secondary compact-button" onClick={() => setSelectedNetworkId(network.id ?? '')}>{network.id === selectedNetworkId ? 'Đang xem' : 'Xem thành viên'}</button>
                                                <button type="button" className="button-secondary compact-button" onClick={() => void openEdit(network.id ?? '')}>Sửa</button>
                                                <button type="button" className="button-secondary compact-button" onClick={() => handleDeleteNetworkClick(network.id ?? '')}>
                                                    {confirmDeleteNetworkId === network.id ? 'Xác nhận xoá?' : 'Xoá'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {networks.length === 0 && !networksError && <div className="empty-state">Controller chưa quản lý network nào — bấm "Tạo network mới" ở trên.</div>}
                    </div>
                )}
            </section>

            {selectedNetworkId && (
                <section className="glass-panel dashboard-section" style={{ marginTop: 20 }}>
                    <div className="section-heading">
                        <div><h2>Thành viên — {selectedNetwork?.name ?? selectedNetworkId}</h2><p>Trạng thái cấp phép, IP đã gán, địa chỉ vật lý gần nhất controller ghi nhận được.</p></div>
                        <span>{formatCount(members.length)} thành viên</span>
                    </div>
                    {membersError && <InlineWarning message={`Không tải được thành viên: ${membersError.message}`} onRetry={() => void fetchMembers(selectedNetworkId)} />}
                    {!membersError && (
                        <div className="stat-chip-row">
                            <StatChip label="Đã cấp phép" value={membersLoading ? 'N/A' : `${authorizedMembers}/${members.length}`} status={membersLoading ? 'unknown' : 'healthy'} />
                            <StatChip label="Đang online" value={membersLoading ? 'N/A' : `${onlineCount}/${members.length}`} status={membersLoading ? 'unknown' : 'healthy'} />
                        </div>
                    )}
                    {membersLoading ? (
                        <div className="loading-block"><div className="loading-spinner" /><span>Đang tải thành viên...</span></div>
                    ) : (
                        <div className="table-shell">
                            <table className="data-table">
                                <thead><tr><th>Node ID</th><th>Tên</th><th>Trạng thái</th><th>Kết nối</th><th>IP đã gán</th><th>Địa chỉ vật lý</th><th>Phiên bản</th><th>Cấp phép gần nhất</th><th>Hành động</th></tr></thead>
                                <tbody>
                                    {members.map(member => {
                                        const badge = authorizedBadge(member.authorized ?? null);
                                        const busy = memberBusyId === member.id;
                                        return (
                                            <tr key={member.id}>
                                                <td><span className="copyable-value"><code>{member.id}</code><CopyButton value={member.id ?? ''} /></span></td>
                                                <td>
                                                    {editNameMemberId === member.id ? (
                                                        <input className="filter-select" style={{ width: 160 }} value={editNameValue} onChange={e => setEditNameValue(e.target.value)} placeholder="vd: Router Hai Nam 81" />
                                                    ) : member.name ?? <span className="muted-text">Chưa đặt tên</span>}
                                                </td>
                                                <td><span className={`status-dot ${badge.status}`}>{badge.label}</span></td>
                                                <td>{(() => { const ob = onlineBadge(member.online); return <span className={ob.className}>{ob.label}</span>; })()}</td>
                                                <td>
                                                    {editIpMemberId === member.id ? (
                                                        <input
                                                            className="filter-select"
                                                            style={{ width: 180 }}
                                                            value={editIpValue}
                                                            onChange={e => setEditIpValue(e.target.value)}
                                                            placeholder="172.30.139.9, 172.30.139.10"
                                                        />
                                                    ) : (member.ip_assignments ?? []).length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            {(member.ip_assignments ?? []).map(ip => (
                                                                <span className="copyable-value" key={ip}><code>{ip}</code><CopyButton value={ip} /></span>
                                                            ))}
                                                        </div>
                                                    ) : 'Chưa gán'}
                                                </td>
                                                <td>
                                                    {member.physical_address ? (
                                                        <span className="copyable-value"><code>{member.physical_address}</code><CopyButton value={member.physical_address} /></span>
                                                    ) : 'Chưa thấy'}
                                                </td>
                                                <td>{member.version ?? 'Không rõ'}</td>
                                                <td>{member.last_authorized_at ? new Date(member.last_authorized_at).toLocaleString('vi-VN') : 'Chưa từng'}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        <button type="button" className="button-secondary compact-button" disabled={busy} onClick={() => void toggleAuthorized(member)}>
                                                            {member.authorized ? 'Thu hồi' : 'Cấp phép'}
                                                        </button>
                                                        {editNameMemberId === member.id ? (
                                                            <>
                                                                <button type="button" className="button-secondary compact-button" disabled={busy} onClick={() => void saveEditName(member)}>Lưu tên</button>
                                                                <button type="button" className="button-secondary compact-button" onClick={cancelEditName}>Huỷ</button>
                                                            </>
                                                        ) : (
                                                            <button type="button" className="button-secondary compact-button" disabled={busy} onClick={() => openEditName(member)}>Sửa tên</button>
                                                        )}
                                                        {editIpMemberId === member.id ? (
                                                            <>
                                                                <button type="button" className="button-secondary compact-button" disabled={busy} onClick={() => void saveEditIp(member)}>Lưu</button>
                                                                <button type="button" className="button-secondary compact-button" onClick={cancelEditIp}>Huỷ</button>
                                                            </>
                                                        ) : (
                                                            <button type="button" className="button-secondary compact-button" disabled={busy} onClick={() => openEditIp(member)}>Sửa IP</button>
                                                        )}
                                                        <button type="button" className="button-secondary compact-button" disabled={busy} onClick={() => handleDeleteMemberClick(member)}>
                                                            {confirmDeleteMemberId === member.id ? 'Xác nhận xoá?' : 'Xoá'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {members.length === 0 && !membersError && <div className="empty-state">Network này chưa có thành viên nào.</div>}
                        </div>
                    )}
                </section>
            )}

            {showCreate && (
                <div className="modal-overlay" role="dialog" onClick={closeCreate}>
                    <div className="modal-card glass-panel" onClick={e => e.stopPropagation()}>
                        <div className="section-heading"><div><h2>Tạo network mới</h2></div><button type="button" className="button-secondary compact-button" onClick={closeCreate}><X size={14} /></button></div>
                        <form onSubmit={e => void submitCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <label className="filter-control">
                                <span>Tên network</span>
                                <input className="filter-select" required value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="vd: CREW-VPN" />
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                <input type="checkbox" checked={createForm.private} onChange={e => setCreateForm({ ...createForm, private: e.target.checked })} />
                                <span>Riêng tư (phải cấp phép thủ công từng thành viên — khuyến nghị)</span>
                            </label>
                            {createError && <InlineWarning message={createError} />}
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button type="button" className="button-secondary compact-button" onClick={closeCreate}>Huỷ</button>
                                <button type="submit" className="filter-apply" disabled={createBusy}>{createBusy ? 'Đang tạo...' : 'Tạo network'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingNetworkId && (
                <div className="modal-overlay" role="dialog" onClick={closeEdit}>
                    <div className="modal-card modal-card-wide glass-panel" onClick={e => e.stopPropagation()}>
                        <div className="section-heading"><div><h2>Sửa network</h2><p className="copyable-value"><code>{editingNetworkId}</code><CopyButton value={editingNetworkId ?? ''} /></p></div><button type="button" className="button-secondary compact-button" onClick={closeEdit}><X size={14} /></button></div>
                        {editLoading || !editForm ? (
                            <div className="loading-block"><div className="loading-spinner" /><span>Đang tải...</span></div>
                        ) : (
                            <form onSubmit={e => void submitEdit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <label className="filter-control">
                                    <span>Tên network</span>
                                    <input className="filter-select" required value={editForm.name} onChange={e => setEditForm(f => f && { ...f, name: e.target.value })} />
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                    <input type="checkbox" checked={editForm.private} onChange={e => setEditForm(f => f && { ...f, private: e.target.checked })} />
                                    <span>Riêng tư</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                    <input type="checkbox" checked={editForm.autoAssignV4} onChange={e => setEditForm(f => f && { ...f, autoAssignV4: e.target.checked })} />
                                    <span>Tự động cấp IPv4 (tắt thì phải tự gán IP tay cho từng thành viên ở bảng thành viên)</span>
                                </label>

                                <div>
                                    <div className="section-heading" style={{ marginBottom: 6 }}>
                                        <div><h3 style={{ margin: 0, fontSize: 14 }}>Dải IP cấp phát</h3></div>
                                        <button type="button" className="button-secondary compact-button" onClick={addPoolRow}><Plus size={14} /> Thêm dải</button>
                                    </div>
                                    <div className="editable-row-list">
                                        {editForm.pools.map((p, i) => {
                                            const count = poolAddressCount(p.ip_range_start, p.ip_range_end);
                                            return (
                                                <div key={i}>
                                                    <div className="editable-row">
                                                        <input className="filter-select" placeholder="172.30.139.1" value={p.ip_range_start} onChange={e => updatePoolRow(i, 'ip_range_start', e.target.value)} />
                                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>đến</span>
                                                        <input className="filter-select" placeholder="172.30.139.254" value={p.ip_range_end} onChange={e => updatePoolRow(i, 'ip_range_end', e.target.value)} />
                                                        <button type="button" className="button-secondary compact-button" onClick={() => removePoolRow(i)}><X size={14} /></button>
                                                    </div>
                                                    {count !== null && count > 256 && (
                                                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#b45309' }}>
                                                            ⚠ Dải này có {count.toLocaleString('vi-VN')} địa chỉ — controller ZeroTier thực tế KHÔNG tự cấp IP được với dải quá lớn/vắt qua nhiều khối mạng (đã xác nhận thật, không phải suy đoán). Nên chia thành nhiều dải nhỏ, mỗi dải tối đa 1 khối /24 (254 địa chỉ).
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {editForm.pools.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Chưa có dải IP nào — thành viên sẽ không được tự động cấp IP.</p>}
                                    </div>
                                </div>

                                <div>
                                    <div className="section-heading" style={{ marginBottom: 6 }}>
                                        <div><h3 style={{ margin: 0, fontSize: 14 }}>Route</h3></div>
                                        <button type="button" className="button-secondary compact-button" onClick={addRouteRow}><Plus size={14} /> Thêm route</button>
                                    </div>
                                    <div className="editable-row-list">
                                        {editForm.routes.map((r, i) => (
                                            <div className="editable-row" key={i}>
                                                <input className="filter-select" placeholder="172.30.139.0/24" value={r.target} onChange={e => updateRouteRow(i, 'target', e.target.value)} />
                                                <input className="filter-select" placeholder="Gateway (để trống nếu route nội bộ)" value={r.via} onChange={e => updateRouteRow(i, 'via', e.target.value)} />
                                                <button type="button" className="button-secondary compact-button" onClick={() => removeRouteRow(i)}><X size={14} /></button>
                                            </div>
                                        ))}
                                        {editForm.routes.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Chưa có route nào.</p>}
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>DNS (tuỳ chọn)</h3>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className="filter-select" placeholder="Tên miền, vd fleet.local" value={editForm.dnsDomain} onChange={e => setEditForm(f => f && { ...f, dnsDomain: e.target.value })} />
                                        <input className="filter-select" style={{ flex: 1 }} placeholder="Server DNS, phân tách bằng dấu phẩy" value={editForm.dnsServers} onChange={e => setEditForm(f => f && { ...f, dnsServers: e.target.value })} />
                                    </div>
                                </div>

                                {editError && <InlineWarning message={editError} />}
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                    <button type="button" className="button-secondary compact-button" onClick={closeEdit}>Huỷ</button>
                                    <button type="submit" className="filter-apply" disabled={editSaving}>{editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
