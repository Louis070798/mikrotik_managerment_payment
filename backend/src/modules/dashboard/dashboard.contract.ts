import { ApiException } from '@common/api-exception';
import {
  Availability,
  DASHBOARD_UNITS,
  DashboardMeta,
  DashboardPeriod,
  DashboardQuery,
  DataQuality,
  MetaWarning,
  TELEMETRY_MISSING_SOURCES,
} from './dto';

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_POINTS = 5000;

export function resolvePeriod(query: DashboardQuery, defaultTimezone = 'UTC'): DashboardPeriod {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new ApiException('INVALID_TIME_RANGE', 'from must be earlier than to');
  }

  const stepMs: Record<DashboardPeriod['granularity'], number> = {
    '1m': 60_000,
    '5m': 300_000,
    '1h': 3_600_000,
    '1d': 86_400_000,
  };
  if ((to.getTime() - from.getTime()) / stepMs[query.granularity] > MAX_POINTS) {
    throw new ApiException('INVALID_TIME_RANGE', 'Requested time range has too many buckets', {
      suggested_granularity: '1d',
      max_points: MAX_POINTS,
    });
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    granularity: query.granularity,
    timezone: query.timezone ?? defaultTimezone,
  };
}

export function makeDataQuality(status: DataQuality['status'] = 'INSUFFICIENT_DATA'): DataQuality {
  return {
    score: null,
    status,
    missing_sources: [...TELEMETRY_MISSING_SOURCES],
    counter_resets: null,
    missing_buckets: null,
  };
}

export function makeUnavailableAvailability(code: Availability['code']): Availability {
  return {
    status: code === 'RECONCILIATION_UNAVAILABLE' ? 'UNAVAILABLE' : 'INSUFFICIENT_DATA',
    code,
    message:
      code === 'RECONCILIATION_UNAVAILABLE'
        ? 'No telemetry sources are available to calculate reconciliation.'
        : 'Telemetry sources are not available; inventory values are shown but traffic metrics are withheld.',
    missing_sources: [...TELEMETRY_MISSING_SOURCES],
  };
}

export function makeTelemetryWarnings(code: string, message: string): MetaWarning[] {
  return [
    {
      code,
      message,
      details: { missing_sources: [...TELEMETRY_MISSING_SOURCES] },
    },
  ];
}

export function makeDashboardMeta(period: DashboardPeriod, warnings: MetaWarning[] = []): DashboardMeta {
  return {
    data_from: period.from,
    data_to: period.to,
    data_freshness_seconds: null,
    freshness_by_source: Object.fromEntries(TELEMETRY_MISSING_SOURCES.map((source) => [source, null])),
    warnings,
  };
}

export { DASHBOARD_UNITS };
