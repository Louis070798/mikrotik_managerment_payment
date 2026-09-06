import { z } from 'zod';
import { PeriodQuerySchema } from '@common/period';

export const CrewUsersQuerySchema = PeriodQuerySchema;
export type CrewUsersQuery = z.infer<typeof CrewUsersQuerySchema>;

export const CrewSessionsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
export type CrewSessionsQuery = z.infer<typeof CrewSessionsQuerySchema>;

export const CrewRawAccountingQuerySchema = PeriodQuerySchema.extend({
  username: z.string().min(1).max(255).optional(),
  acct_session_id: z.string().min(1).max(255).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
export type CrewRawAccountingQuery = z.infer<typeof CrewRawAccountingQuerySchema>;
