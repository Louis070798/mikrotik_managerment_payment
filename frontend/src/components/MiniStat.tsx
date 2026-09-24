import React from 'react';

interface MiniStatProps {
    label: string;
    value: React.ReactNode;
    unit?: string;
    hint?: string;
    status?: 'healthy' | 'warning' | 'critical' | 'unknown';
    icon?: React.ReactNode;
}

// Phien ban gon cua MetricCard -- khong co badge trang thai to + Period/Source/Freshness (dung
// dung cho dashboard toan ham doi can minh bach nguon du lieu), chi 1 nhan + 1 gia tri + 1 ghi
// chu nho, dung cho cac trang chi tiet 1 thuc the (vd 1 subscriber) can nhin luot nhanh gon gang.
export const MiniStat: React.FC<MiniStatProps> = ({ label, value, unit, hint, status = 'unknown', icon }) => (
    <div className={`mini-stat mini-stat-${status}`}>
        <div className="mini-stat-top">
            {icon && <span className="mini-stat-icon">{icon}</span>}
            <span className="mini-stat-label">{label}</span>
        </div>
        <span className="mini-stat-value">{value}{unit && <span className="mini-stat-unit">{unit}</span>}</span>
        {hint && <span className="mini-stat-hint">{hint}</span>}
    </div>
);
