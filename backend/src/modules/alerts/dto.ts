import { z } from 'zod';

export const ListAlertsQuerySchema = z.object({
  status: z.enum(['FIRING', 'ACKED', 'RESOLVED']).optional(),
  severity: z.enum(['INFO', 'WARNING', 'MAJOR', 'CRITICAL']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AckAlertSchema = z.object({ note: z.string().nullable().optional() });
export const ResolveAlertSchema = z.object({ reason: z.string().min(3) });
