import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const CreateTenantSchema = z.object({
  parent_id: uuidSchema.nullable().optional(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  contact_name: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
});
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

export const UpdateTenantSchema = CreateTenantSchema.omit({ parent_id: true }).partial();
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

export const ListTenantsQuerySchema = z.object({
  parent_id: uuidSchema.optional(),
});
