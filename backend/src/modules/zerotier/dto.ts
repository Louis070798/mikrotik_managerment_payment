import { z } from 'zod';

const ipv4Schema = z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Phải là địa chỉ IPv4 hợp lệ');
const cidrSchema = z.string().regex(/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/, 'Phải là dạng CIDR hợp lệ (vd 172.30.139.0/24)');

const IpAssignmentPoolSchema = z.object({
  ip_range_start: ipv4Schema,
  ip_range_end: ipv4Schema,
});

const RouteSchema = z.object({
  target: cidrSchema,
  via: ipv4Schema.nullable().optional(),
});

const DnsSchema = z.object({
  domain: z.string().max(255),
  servers: z.array(ipv4Schema).max(8),
});

export const CreateNetworkSchema = z.object({
  name: z.string().min(1).max(255),
  private: z.boolean().default(true),
});
export type CreateNetworkInput = z.infer<typeof CreateNetworkSchema>;

export const UpdateNetworkSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  private: z.boolean().optional(),
  auto_assign_v4: z.boolean().optional(),
  ip_assignment_pools: z.array(IpAssignmentPoolSchema).max(16).optional(),
  routes: z.array(RouteSchema).max(32).optional(),
  dns: DnsSchema.nullable().optional(),
});
export type UpdateNetworkInput = z.infer<typeof UpdateNetworkSchema>;

export const UpdateMemberSchema = z.object({
  authorized: z.boolean().optional(),
  ip_assignments: z.array(ipv4Schema).max(16).optional(),
  // Tên hiển thị -- lưu ở zerotierMemberLabels (controller thật không có field name cho member).
  // Chuỗi rỗng/null = xoá tên đã đặt.
  name: z.string().max(100).nullable().optional(),
});
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;
