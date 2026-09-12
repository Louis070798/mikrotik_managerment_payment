import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const CreateTenantSchema = z.object({
  parent_id: uuidSchema.nullable().optional(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  // Admin tu go mat khau THAT khi tao tenant (khong con tu sinh ngau nhien nua) -- xem
  // tenants.service.ts create(). username van tu sinh tu code nhu truoc, chi mat khau la thu go tay.
  password: z.string().min(4).max(255),
  contact_name: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  contact_email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
});
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

export const UpdateTenantSchema = CreateTenantSchema.omit({ parent_id: true, password: true }).partial();
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

export const ListTenantsQuerySchema = z.object({
  parent_id: uuidSchema.optional(),
});

export const SetTenantPasswordSchema = z.object({
  password: z.string().min(4).max(255),
});
export type SetTenantPasswordInput = z.infer<typeof SetTenantPasswordSchema>;
