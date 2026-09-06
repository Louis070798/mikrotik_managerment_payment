import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, gte, lte, SQL, sql } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { auditLogs } from '@db/schema';
import { getRequestContext } from '@common/request-context';

export interface AuditRecordInput {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  scope?: Record<string, unknown> | null;
  before?: unknown;
  after?: unknown;
  diff?: Record<string, unknown> | null;
  result: 'SUCCESS' | 'FAILURE' | 'DENIED';
  reason?: string | null;
  actorType?: 'USER' | 'SYSTEM' | 'JOB' | 'API_TOKEN';
}

export interface AuditQuery {
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

/**
 * Audit writer — append-only theo docs/backend/02-DATABASE_DESIGN.md §1.5. Role ứng dụng
 * chỉ INSERT/SELECT trên audit_logs (không UPDATE/DELETE) — enforce ở tầng DB permission
 * khi triển khai thật; ở đây enforce bằng việc service này không có method update/delete nào.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  async record(input: AuditRecordInput): Promise<void> {
    const ctx = getRequestContext();
    await this.db.insert(auditLogs).values({
      actorType: input.actorType ?? ctx.actorType,
      actorId: ctx.actorId,
      actorLabel: ctx.actorLabel,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      scope: input.scope ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      diff: input.diff ?? null,
      requestId: ctx.requestId,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      result: input.result,
      reason: input.reason ?? null,
    });
  }

  async list(query: AuditQuery) {
    const conditions: SQL[] = [];
    if (query.resourceType) conditions.push(eq(auditLogs.resourceType, query.resourceType));
    if (query.resourceId) conditions.push(eq(auditLogs.resourceId, query.resourceId));
    if (query.actorId) conditions.push(eq(auditLogs.actorId, query.actorId));
    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.from) conditions.push(gte(auditLogs.createdAt, query.from));
    if (query.to) conditions.push(lte(auditLogs.createdAt, query.to));

    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where);

    return { rows, total: count };
  }
}
