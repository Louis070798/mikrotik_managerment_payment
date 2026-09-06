import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql, SQL } from 'drizzle-orm';
import { DB_TOKEN, DbClient } from '@db/db.module';
import { alerts } from '@db/schema';
import { getRequestContext } from '@common/request-context';

export interface FireAlertInput {
  kind: string;
  fingerprint: string;
  severity: 'INFO' | 'WARNING' | 'MAJOR' | 'CRITICAL';
  scope: Record<string, unknown>;
  title: string;
  summary: string;
  evidence?: Record<string, unknown>;
}

export interface AlertQuery {
  status?: 'FIRING' | 'ACKED' | 'RESOLVED';
  severity?: string;
  limit: number;
  offset: number;
}

/**
 * Item #11 "Alerts khi endpoint unhealthy" — SYSTEM_SPEC §6.4/§7.8.
 *
 * `fingerprint` = hash(kind + scope quan trọng, vd endpoint_id). Partial unique index
 * `alerts_active_fingerprint_uq` (chỉ áp dụng khi status IN ('FIRING','ACKED')) đảm bảo
 * MỘT điều kiện đang mở chỉ có ĐÚNG MỘT hàng — health sweep gọi fire() mỗi vòng lặp mà
 * không tạo alert trùng, và gọi resolve() khi endpoint khoẻ lại.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(@Inject(DB_TOKEN) private readonly db: DbClient) {}

  /** Idempotent: nếu alert với fingerprint này đang FIRING/ACKED thì không tạo thêm, chỉ cập nhật evidence. */
  async fireOrUpdate(input: FireAlertInput): Promise<void> {
    const existing = await this.db.query.alerts.findFirst({
      where: and(eq(alerts.fingerprint, input.fingerprint), sql`${alerts.status} in ('FIRING','ACKED')`),
    });

    if (existing) {
      await this.db
        .update(alerts)
        .set({ evidence: input.evidence ?? {}, summary: input.summary })
        .where(eq(alerts.id, existing.id));
      return;
    }

    try {
      await this.db.insert(alerts).values({
        kind: input.kind as any,
        fingerprint: input.fingerprint,
        status: 'FIRING',
        severity: input.severity,
        scope: input.scope,
        title: input.title,
        summary: input.summary,
        evidence: input.evidence ?? {},
      });
      this.logger.warn(`Alert fired: ${input.kind} — ${input.title}`);
    } catch (err) {
      // Race hiếm giữa hai lần sweep chồng nhau — partial unique index chặn insert trùng,
      // đây là hành vi đúng, không phải lỗi cần propagate.
      if (!isUniqueViolation(err)) throw err;
    }
  }

  /** Đóng mọi alert đang FIRING/ACKED khớp fingerprint — dùng khi endpoint khoẻ lại. */
  async resolveByFingerprint(fingerprint: string, reason: string): Promise<void> {
    const ctx = getRequestContext();
    await this.db
      .update(alerts)
      .set({ status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: ctx.actorLabel, resolveReason: reason })
      .where(and(eq(alerts.fingerprint, fingerprint), sql`${alerts.status} in ('FIRING','ACKED')`));
  }

  async ack(id: string, note: string | null): Promise<{ ok: boolean }> {
    const ctx = getRequestContext();
    const result = await this.db
      .update(alerts)
      .set({ status: 'ACKED', ackedAt: new Date(), ackedBy: ctx.actorLabel, ackNote: note })
      .where(and(eq(alerts.id, id), eq(alerts.status, 'FIRING')))
      .returning({ id: alerts.id });
    return { ok: result.length > 0 };
  }

  async resolve(id: string, reason: string): Promise<{ ok: boolean }> {
    const ctx = getRequestContext();
    const result = await this.db
      .update(alerts)
      .set({ status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: ctx.actorLabel, resolveReason: reason })
      .where(and(eq(alerts.id, id), sql`${alerts.status} in ('FIRING','ACKED')`))
      .returning({ id: alerts.id });
    return { ok: result.length > 0 };
  }

  async list(query: AlertQuery) {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(alerts.status, query.status));
    if (query.severity) conditions.push(eq(alerts.severity, query.severity as any));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(alerts)
      .where(where)
      .orderBy(desc(alerts.startedAt))
      .limit(query.limit)
      .offset(query.offset);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(alerts).where(where);
    return { rows, total: count };
  }

  async findById(id: string) {
    return this.db.query.alerts.findFirst({ where: eq(alerts.id, id) });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
