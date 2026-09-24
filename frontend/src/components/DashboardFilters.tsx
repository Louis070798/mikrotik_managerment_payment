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
                <span>Khoảng thời gian</span>
                <select className="filter-select" value={value.range} onChange={event => update('range', event.target.value as DashboardRange)}>
                    <option value="1h">1 giờ qua</option>
                    <option value="24h">24 giờ qua</option>
                    <option value="7d">7 ngày qua</option>
                </select>
            </label>
            <label className="filter-control">
                <span>Độ chi tiết</span>
                <select className="filter-select" value={value.granularity} onChange={event => update('granularity', event.target.value as DashboardGranularity)}>
                    <option value="1m">1 phút</option>
                    <option value="5m">5 phút</option>
                    <option value="1h">1 giờ</option>
                    <option value="1d">1 ngày</option>
                </select>
            </label>
            <label className="filter-control">
                <span>Nhóm</span>
                <select className="filter-select" value={value.zone} onChange={event => update('zone', event.target.value as DashboardZone)}>
                    <option value="ALL">Tất cả nhóm</option>
                    <option value="CREW">CREW</option>
                    <option value="BUSINESS">BUSINESS</option>
                    <option value="MANAGEMENT">MANAGEMENT</option>
                </select>
            </label>
            <label className="filter-control">
                <span>Múi giờ</span>
                <input className="filter-select" value={value.timezone} onChange={event => update('timezone', event.target.value)} aria-label="Múi giờ" />
            </label>
            <button type="submit" disabled={loading} className="filter-apply">
                {loading ? 'Đang tải…' : 'Áp dụng bộ lọc'}
            </button>
        </form>
    );
};
