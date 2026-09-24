import { eq, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { ApiException } from './api-exception';
import { getRequestContext } from './request-context';

/**
 * Loc du lieu theo tenant cua actor.
 *
 * Van de goc: TENANT_PERMISSIONS cap quyen theo LOAI hanh dong (subscriber:read, dashboard:read...)
 * nhung khong he gioi han PHAM VI du lieu. Mot dai ly dang nhap voi subscriber:read truoc day doc
 * duoc subscriber cua MOI dai ly khac, vi khong service nao loc theo tenant_id — bo loc duy nhat
 * la mot query param do chinh client truyen vao, bo di la thay het.
 *
 * Nguyen tac o day:
 *   - tenant_id LUON lay tu token da ky qua RequestContext, khong bao gio tu input cua request.
 *   - Admin khong bi loc (tenantCondition tra undefined).
 *   - Truy cap nham tenant tra NOT_FOUND chu khong phai FORBIDDEN: FORBIDDEN xac nhan "co ton tai
 *     ban ghi nay", tu no da la mot ro ri thong tin.
 */

export function isTenantActor(): boolean {
  return getRequestContext().actorRole === 'tenant';
}

/** tenant_id cua actor hien tai, hoac null khi la admin / job nen. */
export function currentTenantId(): string | null {
  const ctx = getRequestContext();
  return ctx.actorRole === 'tenant' ? ctx.actorTenantId : null;
}

/**
 * Dieu kien WHERE gan vao truy van danh sach. Tra undefined cho admin de goi y nguyen ven.
 * Tenant khong co tenant_id trong token thi tra mot dieu kien KHONG BAO GIO DUNG — fail closed,
 * tot hon la bo loc va tra ve tat ca.
 */
export function tenantCondition(column: PgColumn): SQL | undefined {
  const ctx = getRequestContext();
  if (ctx.actorRole !== 'tenant') return undefined;
  return eq(column, ctx.actorTenantId ?? '00000000-0000-0000-0000-000000000000');
}

/**
 * Chan truy cap mot ban ghi cu the. Goi ngay sau khi tra ban ghi ra khoi DB, truoc khi dung no.
 * `ownerTenantId` null (vd tau chua gan dai ly nao) thi tenant khong duoc xem.
 */
export function assertTenantOwns(ownerTenantId: string | null | undefined, notFoundCode: string, message: string): void {
  const tenantId = currentTenantId();
  if (tenantId === null) return;
  if (!ownerTenantId || ownerTenantId !== tenantId) {
    throw new ApiException(notFoundCode as never, message);
  }
}

/**
 * Chan truy cap theo TAU. Thiet bi, interface, crew, business, reconciliation... deu thuoc ve mot
 * tau, va tau moi la thu mang tenant_id. Dung ham nay o moi cho tra cuu theo shipId de khong phai
 * lap lai phep join o tung service.
 */
export async function assertShipInTenantScope(
  loadShipTenantId: (shipId: string) => Promise<string | null | undefined>,
  shipId: string,
  notFoundMessage: string,
): Promise<void> {
  if (currentTenantId() === null) return;
  const owner = await loadShipTenantId(shipId);
  assertTenantOwns(owner, 'SHIP_NOT_FOUND', notFoundMessage);
}
