import React from 'react';
import { Clock } from 'lucide-react';

export const FreshnessIndicator: React.FC<{ seconds?: number }> = ({ seconds }) => {
    if (seconds === undefined || seconds === null) return null;

    const isStale = seconds > 60; // Older than 1 min is considered stale

    return (
        <div className={`freshness-indicator ${isStale ? 'stale' : 'fresh'}`}>
            <Clock size={14} />
            <span>
                {isStale ? `Data is ${seconds}s old (Stale)` : `Updated ${seconds}s ago`}
            </span>
        </div>
    );
}
