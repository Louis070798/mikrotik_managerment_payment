import { z } from 'zod';

export const FinanceQuerySchema = z.object({
  // "Sap het han" window - so ngay tinh tu bay gio de gom subscriber ACTIVE sap den expires_at.
  expiring_within_days: z.coerce.number().int().min(1).max(365).default(30),
});
export type FinanceQuery = z.infer<typeof FinanceQuerySchema>;
