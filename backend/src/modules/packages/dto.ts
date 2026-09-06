import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const CreatePackageSchema = z.object({
  // NULL = gói dùng chung cho mọi tenant (thiết kế README mục 11: RIÊNG/KẾ THỪA).
  tenant_id: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(255),
  down_mbps: z.number().int().positive(),
  up_mbps: z.number().int().positive(),
  // README: không còn gói "không giới hạn" — luôn là số cụ thể.
  quota_gb: z.number().int().positive(),
  duration_unit: z.enum(['DAY', 'MONTH']),
  duration_value: z.number().int().positive(),
  price_vnd: z.number().nonnegative(),
  max_concurrent_devices: z.number().int().positive().default(1),
});
export type CreatePackageInput = z.infer<typeof CreatePackageSchema>;

export const UpdatePackageSchema = CreatePackageSchema.omit({ tenant_id: true }).partial();
export type UpdatePackageInput = z.infer<typeof UpdatePackageSchema>;

export const ListPackagesQuerySchema = z.object({
  tenant_id: uuidSchema.optional(),
});
