/**
 * Nguon su that DUY NHAT cho "vai tro nao co quyen gi".
 *
 * Truoc day danh sach nay nam trong auth.service.ts va chi duoc dung luc DANG NHAP de tra ve cho
 * client; con guard thi doc quyen tu header do chinh client gui len. Nghia la danh sach nay chua
 * bao gio thuc su chan dieu gi -- client co the tu khai '*'. Tach ra day de guard va auth service
 * dung chung dung mot bang quyen, va guard suy ra quyen TU TOKEN DA KY chu khong tu header.
 */

/**
 * Whitelist cho tai khoan "tenant" (dai ly). Loai tru cac quyen ha tang/to chuc: settings:*,
 * endpoint:* (chi Superadmin), inventory:write (cau truc ham doi), package:write (gia goi cuoc),
 * tenant:write (tranh leo thang quyen qua chinh co che nay), zerotier:write, audit:read.
 *
 * GIOI HAN CON LAI: day van la danh sach quyen CHUNG, chua scope theo tung tenant. Mot tenant co
 * subscriber:read hien van doc duoc subscriber cua tenant khac vi cac service chua loc theo
 * tenant_id. Viec do can mot buoc rieng (dua actor.tenant_id vao moi truy van).
 */
export const TENANT_PERMISSIONS = [
  'alert:ack', 'alert:read', 'business:read', 'crew:read', 'crew:write', 'dashboard:read',
  'finance:read', 'health:read', 'inventory:read', 'package:read', 'raw:read',
  'reconciliation:read', 'subscriber:read', 'subscriber:write', 'tenant:read',
].join(',');

export type ActorRole = 'admin' | 'tenant';

/** Quyen duoc cap cho mot vai tro. Admin la '*' (toan quyen). */
export function permissionsForRole(role: ActorRole): string {
  return role === 'admin' ? '*' : TENANT_PERMISSIONS;
}
