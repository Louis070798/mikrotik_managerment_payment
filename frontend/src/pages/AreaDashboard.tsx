import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { DashboardService, DefaultService } from '../api';
import type { AreaDashboardResponse } from '../api/models/AreaDashboardResponse';
import type { AreaItem } from '../api/models/AreaItem';
import { DataStateNotice } from '../components/DataStateNotice';
import { DashboardFilters } from '../components/DashboardFilters';
import { MetricCard } from '../components/MetricCard';
import { buildDashboardQuery, formatBytes, formatCount, formatPeriod, freshnessLabel, getApiErrorInfo, type DashboardFiltersValue } from '../lib/dashboard';

const initialFilters: DashboardFiltersValue = { range: '24h', timezone: 'UTC', granularity: '1h', zone: 'ALL' };

export const AreaDashboard: React.FC = () => {
    const [filters, setFilters] = useState(initialFilters);
    const [areas, setAreas] = useState<AreaItem[]>([]);
    const [selectedAreaId, setSelectedAreaId] = useState('');
    const [search, setSearch] = useState('');
    const [areaFilter, setAreaFilter] = useState('ALL');
    const [response, setResponse] = useState<AreaDashboardResponse>();
    const [loading, setLoading] = useState(true);
    const [areasLoading, setAreasLoading] = useState(true);
    const [error, setError] = useState('');
    const requestId = useRef(0);
    const query = useMemo(() => buildDashboardQuery(filters), [filters]);

    useEffect(() => {
        let active = true;
        void DefaultService.getAreas({}).then(next => {
            if (!active) return;
            const items = next.data ?? [];
            setAreas(items);
            const firstAreaId = items[0]?.id ?? '';
            setSelectedAreaId(current => current || firstAreaId);
        }).catch(requestError => {
            if (active) setError(getApiErrorInfo(requestError).message);
        }).finally(() => { if (active) setAreasLoading(false); });
        return () => { active = false; };
    }, []);

    const fetchData = useCallback(async () => {
        if (!selectedAreaId) return;
        const currentRequestId = ++requestId.current;
        setLoading(true);
        setError('');
        try {
            const nextResponse = await DashboardService.getAreasDashboard({ areaId: selectedAreaId, ...query });
            if (currentRequestId === requestId.current) setResponse(nextResponse);
        } catch (requestError) {
            if (currentRequestId === requestId.current) setError(getApiErrorInfo(requestError).message);
        } finally {
            if (currentRequestId === requestId.current) setLoading(false);
        }
    }, [query, selectedAreaId]);

    useEffect(() => () => { requestId.current += 1; }, []);

    // This effect synchronizes the dashboard with the external API; its async callback owns loading/error state.
    // oxlint-disable-next-line react/set-state-in-effect
    useEffect(() => { void fetchData(); }, [fetchData]);

    const visibleAreas = areas.filter(area => {
        const matchesSearch = `${area.name ?? ''} ${area.code ?? ''}`.toLowerCase().includes(search.toLowerCase());
        const matchesRegion = areaFilter === 'ALL' || area.code === areaFilter;
        return matchesSearch && matchesRegion;
    });
    const data = response?.data;
    const meta = response?.meta;
    const traffic = data?.traffic;
    const down = formatBytes(traffic?.wan_download_bytes);
    const up = formatBytes(traffic?.wan_upload_bytes);
    const ships = data?.ships ?? [];

    return (
        <div>
            <div className="filters-bar">
                <label className="filter-control filter-control-inline"><span>Search</span><input className="filter-select" value={search} onChange={event => setSearch(event.target.value)} placeholder="Area name or code" /></label>
                <label className="filter-control"><span>Area</span><select className="filter-select" value={areaFilter} onChange={event => setAreaFilter(event.target.value)}><option value="ALL">All areas</option>{areas.map(area => <option key={area.id} value={area.code}>{area.name}</option>)}</select></label>
            </div>
            <DashboardFilters value={filters} onChange={setFilters} onApply={() => void fetchData()} loading={loading} />

            {error && <DataStateNotice dataStatus="UNAVAILABLE" title="Area dashboard request failed" description={error} onRetry={() => void fetchData()} />}
            {!error && response && <DataStateNotice dataStatus={data?.data_status} availability={data?.availability} quality={data?.data_quality} meta={meta} onRetry={() => void fetchData()} />}

            <div className="area-selector-grid">
                {visibleAreas.map(area => (
                    <button key={area.id} type="button" className={`glass-panel area-selector ${selectedAreaId === area.id ? 'selected' : ''}`} onClick={() => setSelectedAreaId(area.id ?? '')}>
                        <span><MapPin size={17} /> {area.name}</span><strong>{formatCount(area.ship_count)} ships</strong><small>{area.code ?? 'Code not set'} · {area.timezone ?? 'Timezone not set'}</small>
                    </button>
                ))}
                {!areasLoading && visibleAreas.length === 0 && <div className="empty-state">No area matches the current search.</div>}
            </div>

            {loading && !response ? <div className="loading-block"><div className="loading-spinner" /><span>Loading area dashboard…</span></div> : data ? (
                <>
                    <div className="dashboard-meta"><span><strong>Area:</strong> {data.area?.name ?? selectedAreaId}</span><span><strong>Period:</strong> {formatPeriod(data.period)}</span><span><strong>Freshness:</strong> {freshnessLabel(meta)}</span><span><strong>Sources:</strong> inventory, interface counters, RADIUS, IPFIX</span></div>
                    <div className="grid-cards">
                        <MetricCard title="Area ships" value={formatCount(data.inventory?.ship_count)} unit="ships" period={formatPeriod(data.period)} source="Inventory database" freshness={freshnessLabel(meta)} status="healthy" />
                        <MetricCard title="Active ships" value={formatCount(data.inventory?.active_ships)} unit="ships" period={formatPeriod(data.period)} source="Inventory database" freshness={freshnessLabel(meta)} status="healthy" />
                        <MetricCard title="WAN download" value={down.value} unit={down.unit} period={formatPeriod(data.period)} source="Interface counters" freshness={freshnessLabel(meta)} status={traffic?.wan_download_bytes === null || traffic?.wan_download_bytes === undefined ? 'unknown' : 'healthy'} />
                        <MetricCard title="WAN upload" value={up.value} unit={up.unit} period={formatPeriod(data.period)} source="Interface counters" freshness={freshnessLabel(meta)} status={traffic?.wan_upload_bytes === null || traffic?.wan_upload_bytes === undefined ? 'unknown' : 'healthy'} />
                    </div>

                    <section className="glass-panel dashboard-section">
                        <div className="section-heading"><div><h2>Ships in this area</h2><p>Inventory is available even while traffic telemetry is insufficient.</p></div><span className="state-badge badge-warning">{data.data_status ?? 'UNKNOWN'}</span></div>
                        <div className="table-shell"><table className="data-table"><thead><tr><th>Ship</th><th>Status</th><th>Timezone</th><th>Next action</th></tr></thead><tbody>{ships.map(ship => <tr key={ship.id}><td><Link to={`/ships?ship=${ship.id}`}>{ship.name ?? ship.code ?? ship.id}</Link><div className="muted-text">{ship.code ?? ship.id}</div></td><td><span className={`status-dot ${ship.status === 'ACTIVE' ? 'healthy' : ship.status === 'MAINTENANCE' ? 'warning' : 'critical'}`}>{ship.status ?? 'UNKNOWN'}</span></td><td>{ship.timezone ?? 'Not set'}</td><td><Link to={`/ships?ship=${ship.id}`}>Open ship dashboard →</Link></td></tr>)}</tbody></table></div>
                    </section>
                </>
            ) : null}
        </div>
    );
};
