import { z } from 'zod';

// Chi dung lai dung 5 bien Tier-0 da lam DONG BANG trong env.schema.ts (ADR-04) -- KHONG them
// endpoint moi cho tung service cu the o day, nhung 5 bien nay da la ngoai le duoc thua nhan san
// (DATABASE_CONTROL_URL/port lang nghe cua chinh backend), nen sua GIA TRI cua chung qua UI la
// hop ly, khong pha kien truc.
export const UpdateSettingsSchema = z.object({
  database: z
    .object({
      host: z.string().min(1).optional(),
      port: z.coerce.number().int().min(1).max(65535).optional(),
      database: z.string().min(1).optional(),
      username: z.string().min(1).optional(),
      // Rong/thieu = giu nguyen mat khau hien tai.
      password: z.string().optional(),
    })
    .optional(),
  radius_auth_port: z.coerce.number().int().min(1).max(65535).optional(),
  radius_acct_port: z.coerce.number().int().min(1).max(65535).optional(),
  netflow_port: z.coerce.number().int().min(1).max(65535).optional(),
  dns_log_port: z.coerce.number().int().min(1).max(65535).optional(),
  // Rong/thieu = giu nguyen.
  zerotier_controller_token: z.string().min(1).optional(),
  // Bat buoc -- moi thay doi Settings di thang vao audit_logs, giong quy uoc UpdateEndpointSchema.
  reason: z.string().min(3, 'reason is required for settings changes (goes into audit_logs)'),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
