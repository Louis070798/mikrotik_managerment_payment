import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FinanceService, ReconciliationService } from '../api';
import type { GlobalReconciliationResponse } from '../api/models/GlobalReconciliationResponse';
import type { GlobalFinanceResponse } from '../api/models/GlobalFinanceResponse';
import { DataStateNotice } from '../components/DataStateNotice';
import { DashboardFilters } from '../components/DashboardFilters';
import { MetricCard } from '../components/MetricCard';
import { buildDashboardQuery, formatBytes, formatCount, formatPercent, formatPeriod, formatVnd, freshnessLabel, getApiErrorInfo, type DashboardFiltersValue, type MetricStatus } from '../lib/dashboard';

/** Mặc định 7 ngày, không phải 24h -- một số tàu (vd Hai Nam 81) có độ trễ đẩy telemetry vài ngày,
 * mặc định 24h khiến trang gần như luôn rỗng ngay lần mở đầu tiên dù dữ liệu thật vẫn tồn tại. */
const initialFilters: DashboardFiltersValue = { range: '7d', timezone: 'UTC', granularity: '1h', zone: 'ALL' };

/** Ngưỡng màu cho % lệch — Hai Nam 81 (tàu thật, đã lắp đủ NetFlow/RADIUS) đo được dưới 10%,
 * dùng làm mốc "khoẻ mạnh". Trên 30% coi là nghiêm trọng (thiếu cấu hình đếm 1 zone lớn). */
function gapStatus(pct: number | null | undefined): MetricStatus {
    if (pct === null || pct === undefined) return 'unknown';
    const abs = Math.abs(pct);
    if (abs <= 10) return 'healthy';
    if (abs <= 30) return 'warning';
    return 'critical';
}

/** Tổng quan chỉ cần data quy về 1 chiều — download/upload tách riêng để vào trang chi tiết từng
 * tàu (WAN & Reconciliation tab) mới cần. Cộng thẳng 2 chiều từ byte thô đã có, không cần API mới. */
function combineBytes(dl: number | null | undefined, ul: number | null | undefined): number | null {
    if (dl == null && ul == null) return null;
    return (dl ?? 0) + (ul ?? 0);
}

/** Gộp gap 2 chiều đã tính sẵn (đúng, null-safe) từ backend thay vì tự trừ lại counted -- tránh
 * lệch quy ước null giữa "không có zone nào" và "1 zone = 0 byte thật". */
function combineGapBytes(measuredDl: number | null | undefined, measuredUl: number | null | undefined, gapDlBytes: number | null | undefined, gapUlBytes: number | null | undefined): { bytes: number | null; pct: number | null } {
    if (gapDlBytes == null || gapUlBytes == null) return { bytes: null, pct: null };
    const bytes = gapDlBytes + gapUlBytes;
    const measured = combineBytes(measuredDl, measuredUl);
    const pct = measured !== null && measured !== 0 ? Math.round((bytes / measured) * 1000) / 10 : null;
    return { bytes, pct };
}

/**
 * Tổng quan — viết lại hoàn toàn (bản cũ chỉ đếm inventory, traffic luôn null cứng, không có độ
 * lệch). Giờ gọi GET /dashboard/global/reconciliation — gộp đúng công thức computeGap() đang chạy
 * thật ở cấp từng tàu (ships/{shipId}/reconciliation) lên toàn hạm đội. Ở mức tổng quan chỉ hiện
 * data gộp cả 2 chiều (không tách download/upload) — tách riêng từng chiều là việc của trang chi
 * tiết tàu (tab "WAN & Reconciliation"), không phải Tổng quan.
 */
export const GlobalDashboard: React.FC = () => {
    const [filters, setFilters] = useState(initialFilters);
    const [response, setResponse] = useState<GlobalReconciliationResponse>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<ReturnType<typeof getApiErrorInfo>>();
    const requestId = useRef(0);

    const fetchData = useCallback(async () => {
        const currentRequestId = ++requestId.current;
        setLoading(true);
        setError(undefined);
        try {
            const nextResponse = await ReconciliationService.getDashboardGlobalReconciliation(buildDashboardQuery(filters));
            if (currentRequestId === requestId.current) setResponse(nextResponse);
        } catch (requestError) {
            if (currentRequestId === requestId.current) {
                setResponse(undefined);
                setError(getApiErrorInfo(requestError));
            }
        } finally {
            if (currentRequestId === requestId.current) setLoading(false);
        }
    }, [filters]);

    useEffect(() => () => { requestId.current += 1; }, []);
    // This effect synchronizes the dashboard with the external API; its async callback owns loading/error state.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchData(); }, [fetchData]);

    // Tai chinh la anh chup tai thoi diem hien tai (packages.price_vnd x subscriber dang ACTIVE),
    // khong phai time-series theo khoang thoi gian nhu doi soat -- fetch doc lap, khong phu thuoc
    // filters/khoang thoi gian cua phan traffic o tren.
    const [financeResponse, setFinanceResponse] = useState<GlobalFinanceResponse>();
    const [financeLoading, setFinanceLoading] = useState(true);
    const [financeError, setFinanceError] = useState<ReturnType<typeof getApiErrorInfo>>();

    const fetchFinance = useCallback(async () => {
        setFinanceLoading(true);
        setFinanceError(undefined);
        try {
            const nextResponse = await FinanceService.getDashboardGlobalFinance({ expiringWithinDays: 30 });
            setFinanceResponse(nextResponse);
        } catch (requestError) {
            setFinanceResponse(undefined);
            setFinanceError(getApiErrorInfo(requestError));
        } finally {
            setFinanceLoading(false);
        }
    }, []);

    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchFinance(); }, [fetchFinance]);

    const data = response?.data;
    const meta = response?.meta;
    const fleet = data?.fleet;
    const total = formatBytes(fleet?.total_bytes);
    const crewTotal = formatBytes(combineBytes(fleet?.crew?.port_download_bytes, fleet?.crew?.port_upload_bytes));
    const businessTotal = formatBytes(combineBytes(fleet?.business?.download_bytes, fleet?.business?.upload_bytes));
    const managementTotal = formatBytes(combineBytes(fleet?.management?.download_bytes, fleet?.management?.upload_bytes));

    const fleetWanGap = combineGapBytes(fleet?.wan?.download_bytes, fleet?.wan?.upload_bytes, fleet?.gaps?.wan_download_gap_bytes, fleet?.gaps?.wan_upload_gap_bytes);
    const fleetCrewGap = combineGapBytes(fleet?.crew?.port_download_bytes, fleet?.crew?.port_upload_bytes, fleet?.gaps?.crew_download_gap_bytes, fleet?.gaps?.crew_upload_gap_bytes);

    const financeData = financeResponse?.data;
    const financeAsOf = financeData?.as_of ? new Date(financeData.as_of).toLocaleString() : 'Not available';
    const financeTotals = financeData?.totals ?? {};
    const financeExpiring = financeData?.expiring_soon ?? {};
    const financeStatus = financeData?.status_breakdown ?? {};
    const financeByPackage = financeData?.by_package ?? [];
    const financeByShip = financeData?.by_ship ?? [];
    const financeByTenant = financeData?.by_tenant ?? [];

    return (
        <div>
            <div className="top-bar">
                <div><h1>Tổng quan</h1><p className="page-subtitle">Tổng data thật và độ lệch (gap) toàn hạm đội — gộp từ đúng công thức đối soát đang chạy ở cấp từng tàu.</p></div>
                <span className="freshness-indicator">{freshnessLabel(meta)}</span>
            </div>

            <DashboardFilters value={filters} onChange={setFilters} onApply={() => void fetchData()} loading={loading} />

            {error && (
                <DataStateNotice
                    dataStatus="UNAVAILABLE"
                    title={error.code === 'RECONCILIATION_UNAVAILABLE' ? 'Chưa có dữ liệu đối soát nào trong khoảng thời gian này' : 'Không tải được tổng quan'}
                    description={error.message}
                    onRetry={() => void fetchData()}
                />
            )}

            {loading && !data ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải…</span></div>
            ) : data ? (
                <>
                    <div className="dashboard-meta">
                        <span><strong>Khoảng thời gian:</strong> {formatPeriod(data.period)}</span>
                        <span><strong>Độ tươi:</strong> {freshnessLabel(meta)}</span>
                        <span><strong>Số tàu có dữ liệu:</strong> {formatCount(data.ship_count)}</span>
                        <span><strong>Nguồn:</strong> interface counters, RADIUS accounting</span>
                    </div>

                    <section className="glass-panel dashboard-section">
                        <div className="section-heading"><div><h2>Tổng data &amp; độ lệch toàn hạm đội</h2><p>Cộng gộp cả download + upload. Tách riêng theo chiều xem ở trang chi tiết từng tàu.</p></div></div>
                        <div className="grid-cards">
                            <MetricCard title="Tổng data" value={total.value} unit={total.unit} period={formatPeriod(data.period)} source="WAN, cả 2 chiều" freshness={freshnessLabel(meta)} status={fleet?.total_bytes == null ? 'unknown' : 'healthy'} />
                            <MetricCard title="Độ lệch WAN" value={formatPercent(fleetWanGap.pct)} period={formatPeriod(data.period)} source="computeGap(WAN, CREW+BUSINESS+MANAGEMENT)" freshness={freshnessLabel(meta)} status={gapStatus(fleetWanGap.pct)} description={fleetWanGap.bytes != null ? `${formatBytes(fleetWanGap.bytes).value} ${formatBytes(fleetWanGap.bytes).unit} chưa quy được zone` : undefined} />
                            <MetricCard title="Độ lệch CREW (port vs RADIUS)" value={formatPercent(fleetCrewGap.pct)} period={formatPeriod(data.period)} source="computeGap(CREW port, RADIUS user bytes)" freshness={freshnessLabel(meta)} status={gapStatus(fleetCrewGap.pct)} description="Lệch cao nghĩa là RADIUS accounting chưa bắt hết phiên." />
                        </div>
                    </section>

                    <section className="glass-panel dashboard-section" style={{ marginTop: 20 }}>
                        <div className="section-heading"><div><h2>Theo zone</h2><p>Tổng data thật theo từng nhóm accounting toàn hạm đội.</p></div></div>
                        <div className="table-shell">
                            <table className="data-table">
                                <thead><tr><th>Zone</th><th>Tổng data</th></tr></thead>
                                <tbody>
                                    <tr><td>CREW</td><td>{crewTotal.value} {crewTotal.unit}</td></tr>
                                    <tr><td>BUSINESS</td><td>{businessTotal.value} {businessTotal.unit}</td></tr>
                                    <tr><td>MANAGEMENT</td><td>{managementTotal.value} {managementTotal.unit}</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="glass-panel dashboard-section" style={{ marginTop: 20 }}>
                        <div className="section-heading"><div><h2>Độ lệch theo từng tàu</h2><p>Sắp theo mức lệch giảm dần — tàu lệch nhiều nhất hiện lên đầu, thường là dấu hiệu thiếu cấu hình đếm 1 zone (vd chưa gán accounting_group cho interface CREW/BUSINESS). Bấm vào tàu để xem chi tiết download/upload riêng.</p></div><span>{formatCount(data.ships?.length)} tàu</span></div>
                        {(data.ships?.length ?? 0) === 0 ? (
                            <div className="empty-state">Chưa có tàu nào có dữ liệu interface counter trong khoảng thời gian này.</div>
                        ) : (
                            <div className="table-shell">
                                <table className="data-table">
                                    <thead><tr><th>Tàu</th><th>Tổng data (WAN)</th><th>Đã quy zone</th><th>Độ lệch</th></tr></thead>
                                    <tbody>
                                        {(data.ships ?? [])
                                            .map(ship => ({ ship, gap: combineGapBytes(ship.wan_download_bytes, ship.wan_upload_bytes, ship.wan_download_gap_bytes, ship.wan_upload_gap_bytes) }))
                                            .sort((a, b) => Math.abs(b.gap.pct ?? 0) - Math.abs(a.gap.pct ?? 0))
                                            .map(({ ship, gap }) => {
                                                const shipWanTotal = formatBytes(combineBytes(ship.wan_download_bytes, ship.wan_upload_bytes));
                                                const shipCountedTotal = formatBytes(combineBytes(ship.counted_download_bytes, ship.counted_upload_bytes));
                                                return (
                                                    <tr key={ship.ship_id}>
                                                        <td><strong>{ship.ship_name}</strong><div className="muted-text">{ship.ship_code}</div></td>
                                                        <td>{shipWanTotal.value} {shipWanTotal.unit}</td>
                                                        <td>{shipCountedTotal.value} {shipCountedTotal.unit}</td>
                                                        <td><span className={`status-dot ${gapStatus(gap.pct)}`}>{formatPercent(gap.pct)}</span></td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            ) : null}

            <section className="glass-panel dashboard-section" style={{ marginTop: 20 }}>
                <div className="section-heading">
                    <div>
                        <h2>Tài chính</h2>
                        <p>Giá trị các gói cước đang hoạt động theo giá niêm yết ({financeAsOf}) — <strong>không phải doanh thu đã thu</strong>, hệ thống chưa lưu lịch sử hoá đơn/thanh toán.</p>
                    </div>
                </div>

                {financeError && (
                    <DataStateNotice
                        dataStatus="UNAVAILABLE"
                        title="Không tải được báo cáo tài chính"
                        description={financeError.message}
                        onRetry={() => void fetchFinance()}
                    />
                )}

                {financeLoading && !financeData ? (
                    <div className="loading-block"><div className="loading-spinner" /><span>Đang tải…</span></div>
                ) : financeData ? (
                    <>
                        <div className="grid-cards">
                            <MetricCard
                                title="Giá trị gói đang hoạt động"
                                value={formatVnd(financeTotals.active_subscription_value_vnd)}
                                period={financeAsOf}
                                source="packages.price_vnd × subscriber ACTIVE"
                                freshness="Trực tiếp từ DB"
                                status="healthy"
                                description="Theo giá niêm yết của gói, không phải tiền đã thu."
                            />
                            <MetricCard
                                title="Subscriber đang hoạt động"
                                value={formatCount(financeTotals.active_subscription_count)}
                                period={financeAsOf}
                                source="subscribers.status = ACTIVE"
                                freshness="Trực tiếp từ DB"
                                status="healthy"
                            />
                            <MetricCard
                                title={`Sắp hết hạn (${financeExpiring.within_days ?? 30} ngày tới)`}
                                value={formatCount(financeExpiring.count)}
                                period={financeAsOf}
                                source="subscribers.expires_at"
                                freshness="Trực tiếp từ DB"
                                status={(financeExpiring.count ?? 0) > 0 ? 'warning' : 'healthy'}
                                description={`Giá trị cần gia hạn: ${formatVnd(financeExpiring.at_risk_value_vnd)}`}
                            />
                        </div>

                        <div className="dashboard-meta" style={{ marginTop: 16 }}>
                            <span><strong>Đang hoạt động:</strong> {formatCount(financeStatus.active)}</span>
                            <span><strong>Tạm ngừng:</strong> {formatCount(financeStatus.suspended)}</span>
                            <span><strong>Đã hết hạn:</strong> {formatCount(financeStatus.expired)}</span>
                        </div>

                        <div className="section-heading" style={{ marginTop: 20 }}>
                            <div><h3>Theo gói cước</h3></div>
                        </div>
                        {financeByPackage.length === 0 ? (
                            <div className="empty-state">Chưa có gói cước nào.</div>
                        ) : (
                            <div className="table-shell">
                                <table className="data-table">
                                    <thead><tr><th>Gói</th><th>Giá niêm yết</th><th>Subscriber active</th><th>Thành tiền</th></tr></thead>
                                    <tbody>
                                        {financeByPackage.map(row => (
                                            <tr key={row.package_id}>
                                                <td>{row.package_name}</td>
                                                <td>{formatVnd(row.price_vnd)}</td>
                                                <td>{formatCount(row.active_subscriber_count)}</td>
                                                <td><strong>{formatVnd(row.subtotal_vnd)}</strong></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="section-heading" style={{ marginTop: 20 }}>
                            <div><h3>Theo tàu</h3></div>
                        </div>
                        {financeByShip.length === 0 ? (
                            <div className="empty-state">Chưa có subscriber active nào gắn với tàu.</div>
                        ) : (
                            <div className="table-shell">
                                <table className="data-table">
                                    <thead><tr><th>Tàu</th><th>Subscriber active</th><th>Thành tiền</th></tr></thead>
                                    <tbody>
                                        {financeByShip
                                            .slice()
                                            .sort((a, b) => (b.subtotal_vnd ?? 0) - (a.subtotal_vnd ?? 0))
                                            .map(row => (
                                                <tr key={row.ship_id ?? 'unassigned'}>
                                                    <td>{row.ship_name ? (<><strong>{row.ship_name}</strong><div className="muted-text">{row.ship_code}</div></>) : <span className="muted-text">Chưa gán thiết bị</span>}</td>
                                                    <td>{formatCount(row.active_subscriber_count)}</td>
                                                    <td><strong>{formatVnd(row.subtotal_vnd)}</strong></td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {financeByTenant.length > 0 && (
                            <>
                                <div className="section-heading" style={{ marginTop: 20 }}>
                                    <div><h3>Theo đại lý</h3></div>
                                </div>
                                <div className="table-shell">
                                    <table className="data-table">
                                        <thead><tr><th>Đại lý</th><th>Subscriber active</th><th>Thành tiền</th></tr></thead>
                                        <tbody>
                                            {financeByTenant.map(row => (
                                                <tr key={row.tenant_id}>
                                                    <td><strong>{row.tenant_name}</strong><div className="muted-text">{row.tenant_code}</div></td>
                                                    <td>{formatCount(row.active_subscriber_count)}</td>
                                                    <td><strong>{formatVnd(row.subtotal_vnd)}</strong></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                ) : null}
            </section>
        </div>
    );
};
