/**
 * pg (node-postgres) does not always return a JS Date for computed timestamp expressions
 * (max/min/coalesce/date_trunc results can come back as strings depending on how the result
 * field's type OID is reported) — drizzle's `sql<Date>` type parameter is a compile-time hint
 * only, not a runtime cast. Every raw-SQL timestamp column read in this codebase should go
 * through this helper rather than assuming `.toISOString()`/`.getTime()` work directly.
 */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
