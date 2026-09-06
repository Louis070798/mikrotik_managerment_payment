import { z } from 'zod';
import { PeriodQuerySchema } from '@common/period';

export const BusinessQuerySchema = PeriodQuerySchema;
export type BusinessQuery = z.infer<typeof BusinessQuerySchema>;

export const BusinessRawRecordsQuerySchema = PeriodQuerySchema.extend({
  src_ip: z.string().min(1).max(64).optional(),
  dst_ip: z.string().min(1).max(64).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
export type BusinessRawRecordsQuery = z.infer<typeof BusinessRawRecordsQuerySchema>;
