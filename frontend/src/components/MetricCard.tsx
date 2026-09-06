import React from 'react';

interface MetricCardProps {
    title: string;
    value: string | number | null | undefined;
    unit?: string;
    period: string;
    source: string;
    freshness: string;
    previousComparison?: string;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    onClick?: () => void;
    description?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
    title, value, unit = '', period, source, freshness, previousComparison, status, onClick, description
}) => {
    const statusColors = {
        healthy: 'var(--success)',
        warning: 'var(--warning)',
        critical: 'var(--danger)',
        unknown: 'var(--text-muted)'
    };

    const content = (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span className="stat-title">{title}</span>
                <span className="state-badge" style={{ background: 'transparent', color: statusColors[status], border: `1px solid ${statusColors[status]}` }}>
                    {status.toUpperCase()}
                </span>
            </div>

            <span className={`stat-value ${value === null || value === undefined ? 'stat-value-unavailable' : ''}`} style={{ margin: '0.5rem 0' }}>
                {value === null || value === undefined ? 'Not available' : value}{value !== null && value !== undefined && unit ? <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>{unit}</span> : null}
            </span>

            {description && <p className="metric-description">{description}</p>}
            <div className="metric-details">
                <span><strong>Period:</strong> {period}</span>
                <span><strong>Source:</strong> {source}</span>
                <span><strong>Freshness:</strong> {freshness}</span>
                {previousComparison && <span className={previousComparison.startsWith('-') ? 'metric-negative' : 'metric-positive'}><strong>vs Prev:</strong> {previousComparison}</span>}
                {onClick !== undefined && <span className="metric-drilldown">Open details →</span>}
            </div>
        </>
    );

    const sharedStyle = {
        borderTop: `3px solid ${statusColors[status]}`,
        cursor: onClick ? 'pointer' : 'default',
    };

    return onClick ? (
        <button
            type="button"
            className="glass-panel stat-card metric-card-button"
            style={{
                ...sharedStyle,
            }}
            onClick={onClick}
            data-testid={`metric-${title.replace(/\s+/g, '-').toLowerCase()}`}
        >
            {content}
        </button>
    ) : (
        <div
            className="glass-panel stat-card"
            style={sharedStyle}
            data-testid={`metric-${title.replace(/\s+/g, '-').toLowerCase()}`}
        >
            {content}
        </div>
    );
};
