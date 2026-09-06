import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ServiceEndpointsService } from '../api';
import { ServiceEndpoint } from '../api/models/ServiceEndpoint';
import { DataStateNotice } from './DataStateNotice';
import { getApiErrorInfo, type MetricStatus } from '../lib/dashboard';

type Props = {
    title: string;
    description: string;
    serviceTypes: ServiceEndpoint.service_type[];
};

function statusClass(status?: string): MetricStatus {
    if (status === 'HEALTHY') return 'healthy';
    if (status === 'DEGRADED') return 'warning';
    if (status === 'UNHEALTHY') return 'critical';
    return 'unknown';
}

export const ServiceEndpointsTable: React.FC<Props> = ({ title, description, serviceTypes }) => {
    const [endpoints, setEndpoints] = useState<ServiceEndpoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionId, setActionId] = useState('');
    const requestId = useRef(0);

    const fetchData = useCallback(async () => {
        const current = ++requestId.current;
        setLoading(true);
        setError('');
        try {
            const res = await ServiceEndpointsService.getServiceEndpoints({});
            if (current === requestId.current) {
                const items = (res.data ?? []).filter(item => item.service_type && serviceTypes.includes(item.service_type));
                setEndpoints(items);
            }
        } catch (requestError) {
            if (current === requestId.current) setError(getApiErrorInfo(requestError).message);
        } finally {
            if (current === requestId.current) setLoading(false);
        }
    }, [serviceTypes]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const runAction = async (id: string, action: 'check' | 'enable' | 'disable') => {
        if (!id) return;
        setActionId(id);
        try {
            if (action === 'check') await ServiceEndpointsService.postServiceEndpointsCheck({ id });
            if (action === 'enable') await ServiceEndpointsService.postServiceEndpointsEnable({ id });
            if (action === 'disable') await ServiceEndpointsService.postServiceEndpointsDisable({ id });
            await fetchData();
        } catch (requestError) {
            setError(getApiErrorInfo(requestError).message);
        } finally {
            setActionId('');
        }
    };

    return (
        <div>
            <div className="top-bar">
                <div><h1>{title}</h1><p className="page-subtitle">{description}</p></div>
                <span className="freshness-indicator">{loading ? 'Đang tải…' : `${endpoints.length} endpoint đã khai báo`}</span>
            </div>

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Không tải được service registry" description={error} onRetry={() => void fetchData()} />}

            {loading && endpoints.length === 0 ? (
                <div className="loading-block"><div className="loading-spinner" /><span>Đang tải service registry…</span></div>
            ) : !error && endpoints.length === 0 ? (
                <div className="empty-state">Chưa có endpoint nào được khai báo cho nhóm dịch vụ này trong service registry (bảng `service_endpoints`).</div>
            ) : endpoints.length > 0 ? (
                <section className="glass-panel dashboard-section">
                    <div className="table-shell">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Service</th><th>Loại</th><th>Địa chỉ</th><th>Ưu tiên</th><th>Trạng thái</th><th>Bật</th><th>RTT</th><th>Kiểm tra gần nhất</th><th>Hành động</th>
                                </tr>
                            </thead>
                            <tbody>
                                {endpoints.map(ep => (
                                    <tr key={ep.id}>
                                        <td><strong>{ep.service_name ?? 'Không rõ'}</strong><div className="muted-text">{ep.environment ?? 'Không rõ môi trường'}</div></td>
                                        <td>{ep.service_type ?? 'UNKNOWN'}</td>
                                        <td>{ep.host ?? 'Không rõ'}:{ep.port ?? '—'}<div className="muted-text">{ep.protocol ?? ''}</div></td>
                                        <td>{ep.priority ?? '—'}</td>
                                        <td>
                                            <span className={`status-dot ${statusClass(ep.status)}`}>{ep.status ?? 'UNKNOWN'}</span>
                                            {ep.is_active && <span className="state-badge badge-success" style={{ marginLeft: 6 }}>ACTIVE</span>}
                                            {ep.in_maintenance && <span className="state-badge badge-warning" style={{ marginLeft: 6 }}>MAINTENANCE</span>}
                                        </td>
                                        <td>{ep.enabled ? 'Có' : 'Không'}</td>
                                        <td>{ep.last_rtt_ms === null || ep.last_rtt_ms === undefined ? 'Không có' : `${ep.last_rtt_ms} ms`}</td>
                                        <td>{ep.last_check_at ? new Date(ep.last_check_at).toLocaleString() : 'Chưa kiểm tra'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button type="button" className="button-secondary compact-button" disabled={actionId === ep.id} onClick={() => void runAction(ep.id ?? '', 'check')}>Check</button>
                                                {ep.enabled
                                                    ? <button type="button" className="button-secondary compact-button" disabled={actionId === ep.id} onClick={() => void runAction(ep.id ?? '', 'disable')}>Tắt</button>
                                                    : <button type="button" className="button-secondary compact-button" disabled={actionId === ep.id} onClick={() => void runAction(ep.id ?? '', 'enable')}>Bật</button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}
        </div>
    );
};
