import { z } from 'zod';

export const ListAuditQuerySchema = z.object({
  resource_type: z.string().optional(),
  resource_id: z.string().uuid().optional(),
  actor_id: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
