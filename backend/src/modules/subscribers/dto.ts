import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const CreateSubscriberSchema = z.object({
  tenant_id: uuidSchema,
  username: z.string().min(1).max(255),
  // Admin tu go mat khau THAT khi tao user (khong con tu sinh ngau nhien nua) -- xem
  // subscribers.service.ts create(). Toi thieu 4 ky tu, du de go tay tren MikroTik Hotspot.
  password: z.string().min(4).max(255),
  display_name: z.string().max(255).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  auth_type: z.enum(['PPPOE', 'HOTSPOT']),
  nas_device_id: uuidSchema.nullable().optional(),
  package_id: uuidSchema,
  expires_at: z.string().datetime(),
});
export type CreateSubscriberInput = z.infer<typeof CreateSubscriberSchema>;

export const SetSubscriberPasswordSchema = z.object({
  password: z.string().min(4).max(255),
});
export type SetSubscriberPasswordInput = z.infer<typeof SetSubscriberPasswordSchema>;

export const UpdateSubscriberSchema = z.object({
  display_name: z.string().max(255).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  auth_type: z.enum(['PPPOE', 'HOTSPOT']).optional(),
  nas_device_id: uuidSchema.nullable().optional(),
  package_id: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED']).optional(),
  expires_at: z.string().datetime().optional(),
});
export type UpdateSubscriberInput = z.infer<typeof UpdateSubscriberSchema>;

export const ListSubscribersQuerySchema = z.object({
  tenant_id: uuidSchema.optional(),
  nas_device_id: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'EXPIRED']).optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

// README bước 2 "Gán gói hàng loạt": để trống field nào = giữ nguyên giá trị hiện tại của mỗi user.
export const BulkAssignSchema = z.object({
  subscriber_ids: z.array(uuidSchema).min(1),
  package_id: uuidSchema.optional(),
  nas_device_id: uuidSchema.optional(),
});
export type BulkAssignInput = z.infer<typeof BulkAssignSchema>;
