import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  actorId: string | null;
  actorLabel: string;
  actorType: 'USER' | 'SYSTEM' | 'JOB' | 'API_TOKEN';
  ip?: string;
  userAgent?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  const ctx = requestContextStorage.getStore();
  if (!ctx) {
    // Xảy ra khi code chạy ngoài một HTTP request (job nền, health sweep interval).
    return { requestId: 'internal', actorId: null, actorLabel: 'system', actorType: 'SYSTEM' };
  }
  return ctx;
}
