import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const CreateZoneSchema = z.object({
  kind: z.enum(['CREW', 'BUSINESS', 'MANAGEMENT']),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
});
export type CreateZoneInput = z.infer<typeof CreateZoneSchema>;

export const CreateInterfaceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['ETHER', 'VLAN', 'BRIDGE', 'WIREGUARD', 'ZEROTIER', 'LTE', 'SFP', 'PPPOE']),
  mac: z.string().nullable().optional(),
  parent_interface_id: uuidSchema.nullable().optional(),
  snmp_index: z.number().int().nullable().optional(),
  speed_bps: z.number().int().positive().nullable().optional(),
  mtu: z.number().int().positive().nullable().optional(),
});
export type CreateInterfaceInput = z.infer<typeof CreateInterfaceSchema>;

export const UpdateInterfaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  mac: z.string().nullable().optional(),
  speed_bps: z.number().int().positive().nullable().optional(),
  mtu: z.number().int().positive().nullable().optional(),
  admin_state: z.enum(['UP', 'DOWN', 'UNKNOWN']).optional(),
  oper_state: z.enum(['UP', 'DOWN', 'UNKNOWN']).optional(),
});
export type UpdateInterfaceInput = z.infer<typeof UpdateInterfaceSchema>;

// SYSTEM_SPEC §6.1 — 4 nhóm bắt buộc: WAN / CREW / BUSINESS / MANAGEMENT (+ NONE = chưa gán).
export const AssignZoneSchema = z
  .object({
    accounting_group: z.enum(['WAN_INPUT', 'CREW_ACCESS', 'BUSINESS_ACCESS', 'MANAGEMENT', 'NONE']),
    zone_id: uuidSchema.nullable().optional(),
    counted_in_reconciliation: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    const needsZone = val.accounting_group === 'CREW_ACCESS' || val.accounting_group === 'BUSINESS_ACCESS' || val.accounting_group === 'MANAGEMENT';
    if (needsZone && !val.zone_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zone_id'], message: 'zone_id is required for CREW_ACCESS/BUSINESS_ACCESS/MANAGEMENT' });
    }
    if (!needsZone && val.zone_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zone_id'], message: 'zone_id must be empty for WAN_INPUT/NONE' });
    }
  });
export type AssignZoneInput = z.infer<typeof AssignZoneSchema>;

const ZONE_KIND_BY_ACCOUNTING_GROUP: Record<string, string> = {
  CREW_ACCESS: 'CREW',
  BUSINESS_ACCESS: 'BUSINESS',
  MANAGEMENT: 'MANAGEMENT',
};
export { ZONE_KIND_BY_ACCOUNTING_GROUP };
