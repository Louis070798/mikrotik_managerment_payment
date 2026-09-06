import { z } from 'zod';
import { ApiException } from './api-exception';

const rfc3339 = z.string().datetime({ offset: true });

export const PeriodQuerySchema = z.object({
  from: rfc3339.optional(),
  to: rfc3339.optional(),
  timezone: z.string().min(1).max(100).optional(),
  granularity: z.enum(['1m', '5m', '1h', '1d']).default('1h'),
});
export type PeriodQuery = z.infer<typeof PeriodQuerySchema>;

export type Period = {
  from: string;
  to: string;
  granularity: PeriodQuery['granularity'];
  timezone: string;
};

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_POINTS = 5000;
const STEP_MS: Record<Period['granularity'], number> = { '1m': 60_000, '5m': 300_000, '1h': 3_600_000, '1d': 86_400_000 };

/**
 * Same resolution rules as modules/dashboard/dashboard.contract.ts#resolvePeriod (ADR-09: `to`
 * defaults to now, `from` defaults to a 24h window, `timezone` only affects the 1d bucket
 * boundary). Duplicated here rather than imported from modules/dashboard because
 * 01-BACKEND_DESIGN.md §3 forbids modules/* importing modules/* — both call sites live in
 * libs/common instead so crew/business/dashboard can all share it going forward.
 */
export function resolvePeriod(query: PeriodQuery, defaultTimezone = 'UTC'): Period {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new ApiException('INVALID_TIME_RANGE', 'from must be earlier than to');
  }
  if ((to.getTime() - from.getTime()) / STEP_MS[query.granularity] > MAX_POINTS) {
    throw new ApiException('INVALID_TIME_RANGE', 'Requested time range has too many buckets', {
      suggested_granularity: '1d',
      max_points: MAX_POINTS,
    });
  }
  return { from: from.toISOString(), to: to.toISOString(), granularity: query.granularity, timezone: query.timezone ?? defaultTimezone };
}
