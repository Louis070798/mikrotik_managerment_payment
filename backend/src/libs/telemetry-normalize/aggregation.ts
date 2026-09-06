import { SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';

export type Granularity = '1m' | '5m' | '1h' | '1d';

/**
 * Query-time bucketing (date_trunc) standing in for the Timescale continuous aggregates described
 * in docs/backend/02-DATABASE_DESIGN.md §3.1/§3.4 ("interface_traffic_5m/_1h/_1d",
 * "*_usage_hourly/daily"). No materialized rollup exists in this phase — every request re-buckets
 * from interface_counter_deltas / radius_sessions / ipfix_flow_records. Acceptable at current data
 * volume; documented as a gap for when real fleet-scale volume arrives.
 *
 * Per ADR-09, `timezone` only affects the boundary of the 1d bucket; 1m/5m/1h are always UTC-aligned.
 */
export function bucketSql(column: PgColumn, granularity: Granularity, timezone: string): SQL<Date> {
  switch (granularity) {
    case '1m':
      return sql<Date>`date_trunc('minute', ${column})`;
    case '5m':
      return sql<Date>`to_timestamp(floor(extract(epoch from ${column}) / 300) * 300)`;
    case '1h':
      return sql<Date>`date_trunc('hour', ${column})`;
    case '1d':
      return sql<Date>`date_trunc('day', ${column} AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`;
    default:
      throw new Error(`Unsupported granularity: ${granularity}`);
  }
}

export const GRANULARITY_SECONDS: Record<Granularity, number> = {
  '1m': 60,
  '5m': 300,
  '1h': 3600,
  '1d': 86400,
};
