import { z } from 'zod';

const rfc3339 = z.string().datetime({ offset: true });

export const DashboardQuerySchema = z.object({
  from: rfc3339.optional(),
  to: rfc3339.optional(),
  timezone: z.string().min(1).max(100).optional(),
  granularity: z.enum(['1m', '5m', '1h', '1d']).default('1h'),
  zone: z.enum(['CREW', 'BUSINESS', 'MANAGEMENT', 'ALL']).default('ALL'),
});

export const RawRecordsQuerySchema = DashboardQuerySchema.extend({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  source: z.enum(['INTERFACE_COUNTER', 'RADIUS_ACCOUNTING', 'IPFIX', 'DNS', 'SYSLOG']).optional(),
  reason: z.string().min(1).max(100).optional(),
});

export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;
export type RawRecordsQuery = z.infer<typeof RawRecordsQuerySchema>;

export type DashboardPeriod = {
  from: string;
  to: string;
  granularity: DashboardQuery['granularity'];
  timezone: string;
};

export type DashboardUnits = {
  traffic_bytes: 'bytes';
  rate: 'bits_per_second';
  utilization: 'percent';
  data_quality_score: 'ratio';
};

export type DataQuality = {
  score: number | null;
  status: 'AVAILABLE' | 'PARTIAL' | 'INSUFFICIENT_DATA';
  missing_sources: string[];
  counter_resets: number | null;
  missing_buckets: number | null;
};

export type Availability = {
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE';
  code: 'INSUFFICIENT_DATA' | 'RECONCILIATION_UNAVAILABLE' | null;
  message: string | null;
  missing_sources: string[];
};

export type MetaWarning = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type DashboardMeta = {
  data_from: string;
  data_to: string;
  data_freshness_seconds: number | null;
  freshness_by_source: Record<string, number | null>;
  warnings: MetaWarning[];
};

export const TELEMETRY_MISSING_SOURCES = ['interface_counters', 'radius_accounting', 'ipfix'] as const;

export const DASHBOARD_UNITS: DashboardUnits = {
  traffic_bytes: 'bytes',
  rate: 'bits_per_second',
  utilization: 'percent',
  data_quality_score: 'ratio',
};

export interface ReconciliationGap {
  crew_download_gap_bytes: number | null;
  crew_download_gap_pct: number | null;
  crew_upload_gap_bytes: number | null;
  crew_upload_gap_pct: number | null;
  wan_download_gap_bytes: number | null;
  wan_download_gap_pct: number | null;
  wan_upload_gap_bytes: number | null;
  wan_upload_gap_pct: number | null;
}

export interface ReconciliationUnavailableData {
  period: DashboardPeriod;
  units: DashboardUnits;
  data_status: 'UNAVAILABLE';
  availability: Availability;
  wan: null;
  crew: null;
  business: null;
  management: null;
  gaps: ReconciliationGap | null;
  gap_reasons: unknown[];
  unattributed_bytes: number | null;
  data_quality: DataQuality;
  formula_version: string;
}
