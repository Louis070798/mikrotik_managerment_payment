import React from 'react';
import type { DashboardFiltersValue, DashboardRange, DashboardZone, DashboardGranularity } from '../lib/dashboard';

type Props = {
    value: DashboardFiltersValue;
    onChange: (value: DashboardFiltersValue) => void;
    onApply: () => void;
    loading?: boolean;
};

export const DashboardFilters: React.FC<Props> = ({ value, onChange, onApply, loading = false }) => {
    const update = <K extends keyof DashboardFiltersValue>(key: K, next: DashboardFiltersValue[K]) => {
        onChange({ ...value, [key]: next });
    };

    return (
        <form className="filters-bar" onSubmit={event => { event.preventDefault(); onApply(); }}>
            <label className="filter-control">
                <span>Period</span>
                <select className="filter-select" value={value.range} onChange={event => update('range', event.target.value as DashboardRange)}>
                    <option value="1h">Last 1 hour</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                </select>
            </label>
            <label className="filter-control">
                <span>Granularity</span>
                <select className="filter-select" value={value.granularity} onChange={event => update('granularity', event.target.value as DashboardGranularity)}>
                    <option value="1m">1 minute</option>
                    <option value="5m">5 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="1d">1 day</option>
                </select>
            </label>
            <label className="filter-control">
                <span>Zone</span>
                <select className="filter-select" value={value.zone} onChange={event => update('zone', event.target.value as DashboardZone)}>
                    <option value="ALL">All zones</option>
                    <option value="CREW">CREW</option>
                    <option value="BUSINESS">BUSINESS</option>
                    <option value="MANAGEMENT">MANAGEMENT</option>
                </select>
            </label>
            <label className="filter-control">
                <span>Timezone</span>
                <input className="filter-select" value={value.timezone} onChange={event => update('timezone', event.target.value)} aria-label="Timezone" />
            </label>
            <button type="submit" disabled={loading} className="filter-apply">
                {loading ? 'Loading…' : 'Apply filters'}
            </button>
        </form>
    );
};
