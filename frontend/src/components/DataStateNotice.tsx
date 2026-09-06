import React from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash2, RefreshCw } from 'lucide-react';
import type { BaseMeta } from '../api/models/BaseMeta';
import type { DashboardAvailability } from '../api/models/DashboardAvailability';
import type { DataQuality } from '../api/models/DataQuality';
import type { ModuleDataQuality } from '../api/models/ModuleDataQuality';
import { missingSourcesFrom } from '../lib/dashboard';

type Props = {
    dataStatus?: string;
    availability?: DashboardAvailability;
    quality?: DataQuality | ModuleDataQuality;
    meta?: BaseMeta;
    title?: string;
    description?: string;
    onRetry?: () => void;
};

export const DataStateNotice: React.FC<Props> = ({ dataStatus, availability, quality, meta, title, description, onRetry }) => {
    const unavailable = dataStatus === 'UNAVAILABLE' || availability?.status === 'UNAVAILABLE';
    const insufficient = dataStatus === 'INSUFFICIENT_DATA' || availability?.status === 'INSUFFICIENT_DATA';
    const partial = quality?.status === 'PARTIAL';
    const status = unavailable ? 'critical' : insufficient ? 'warning' : partial ? 'warning' : 'healthy';
    const sources = missingSourcesFrom(availability, meta, quality);
    const Icon = unavailable || insufficient || partial ? AlertTriangle : CheckCircle2;
    const defaultTitle = unavailable ? 'Data unavailable' : insufficient ? 'Inventory available; telemetry is insufficient' : partial ? 'Partial data' : 'Data available';
    const defaultDescription = unavailable
        ? availability?.message ?? 'The API did not return enough telemetry to calculate this view.'
        : insufficient
            ? availability?.message ?? 'Traffic metrics are intentionally withheld until the required collectors report data.'
            : partial
                ? 'Some sources are delayed or missing. Interpret totals with the quality and freshness details below.'
                : 'The response contains the sources needed for this view.';
    const guidance = sources.map(source => {
        if (source === 'INTERFACE_COUNTER') return 'Verify interface counter collection (SNMP or API polling) and confirm the interface accounting group/count flag.';
        if (source === 'RADIUS_ACCOUNTING') return 'Configure RADIUS accounting/User Manager accounting and confirm interim updates reach the accounting collector.';
        if (source === 'IPFIX') return 'Configure MikroTik IPFIX export to the flow collector; flow-derived attribution stays unavailable until records arrive.';
        return `Verify the ${source} source in the service endpoint registry and wait for a successful health check.`;
    });

    return (
        <section className={`data-state data-state-${status}`} role="status">
            <div className="data-state-icon"><Icon size={20} /></div>
            <div className="data-state-copy">
                <strong>{title ?? defaultTitle}</strong>
                <p>{description ?? defaultDescription}</p>
                {sources.length > 0 && (
                    <div className="data-state-sources">
                        <span>Missing or delayed sources:</span>
                        {sources.map(source => <code key={source}>{source}</code>)}
                    </div>
                )}
                {meta?.warnings && meta.warnings.length > 0 && (
                    <ul className="data-state-warnings">
                        {meta.warnings.map((warning, index) => <li key={`${warning.code ?? 'warning'}-${index}`}>{warning.message ?? warning.code}</li>)}
                    </ul>
                )}
                {sources.length > 0 && (
                    <details className="collector-guidance">
                        <summary>How to restore this data</summary>
                        <ol>{guidance.map(item => <li key={item}>{item}</li>)}</ol>
                        <p>After configuration, run a health check and retry this dashboard. Until then, null values remain intentionally unavailable.</p>
                    </details>
                )}
            </div>
            {onRetry && (
                <button type="button" className="button-secondary" onClick={onRetry}>
                    <RefreshCw size={15} /> Retry
                </button>
            )}
        </section>
    );
};

export const AwaitingContract: React.FC<{ title: string; endpoint: string; detail: string }> = ({ title, endpoint, detail }) => (
    <section className="empty-state" role="status">
        <CircleSlash2 size={22} />
        <div>
            <strong>{title}</strong>
            <p>{detail}</p>
            <code>{endpoint}</code>
        </div>
    </section>
);
