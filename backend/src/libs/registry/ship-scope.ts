import { EndpointCandidate } from './registry.types';

/**
 * Applies `service_endpoints.ship_scope` (ADR-04) to a resolved candidate list. This was a
 * documented gap in ServiceRegistry.resolve() (it returns every enabled candidate for a
 * service_name regardless of scope) — callers that need per-ship results (CREW/BUSINESS/health
 * HA checks) must filter with this helper until ServiceRegistry.resolve() grows a `shipId` param
 * of its own.
 */
export function matchesShipScope(shipScope: unknown, ctx: { shipId: string; areaId: string }): boolean {
  if (!shipScope || typeof shipScope !== 'object') return true; // default {"type":"ALL"} shape
  const scope = shipScope as { type?: string; ids?: unknown };
  if (!scope.type || scope.type === 'ALL') return true;
  const ids = Array.isArray(scope.ids) ? (scope.ids as string[]) : [];
  if (scope.type === 'AREA') return ids.includes(ctx.areaId);
  if (scope.type === 'SHIP') return ids.includes(ctx.shipId);
  return true;
}

export function filterByShipScope(candidates: EndpointCandidate[], ctx: { shipId: string; areaId: string }): EndpointCandidate[] {
  return candidates.filter((c) => matchesShipScope(c.shipScope, ctx));
}
