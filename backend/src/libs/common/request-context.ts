import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  actorId: string | null;
  actorLabel: string;
  actorType: 'USER' | 'SYSTEM' | 'JOB' | 'API_TOKEN';
  /** Vai tro lay tu token DA KY. null khi chay ngoai HTTP request (job nen). */
  actorRole: 'admin' | 'tenant' | null;
  /**
   * tenant_id cua actor, chi co khi actorRole === 'tenant'. Day la NGUON DUY NHAT de loc du lieu
   * theo tenant — KHONG duoc lay tu query param, vi tham so do do client tu dat.
   */
  actorTenantId: string | null;
  ip?: string;
  userAgent?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  const ctx = requestContextStorage.getStore();
  if (!ctx) {
    // Xảy ra khi code chạy ngoài một HTTP request (job nền, health sweep interval).
    return { requestId: 'internal', actorId: null, actorLabel: 'system', actorType: 'SYSTEM', actorRole: null, actorTenantId: null };
  }
  return ctx;
}
