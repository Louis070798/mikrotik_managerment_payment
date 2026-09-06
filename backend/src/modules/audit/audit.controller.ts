import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { AuditService } from '@audit/audit.service';
import { ListAuditQuerySchema } from './dto';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @RequirePermission('audit:read')
  async list(@Query() query: Record<string, string>) {
    const parsed = ListAuditQuerySchema.parse(query);
    const { rows, total } = await this.service.list({
      resourceType: parsed.resource_type,
      resourceId: parsed.resource_id,
      actorId: parsed.actor_id,
      action: parsed.action,
      from: parsed.from ? new Date(parsed.from) : undefined,
      to: parsed.to ? new Date(parsed.to) : undefined,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    return {
      data: rows.map((r) => ({
        id: r.id,
        actor: { type: r.actorType, id: r.actorId, label: r.actorLabel },
        action: r.action,
        resource: { type: r.resourceType, id: r.resourceId },
        scope: r.scope,
        result: r.result,
        reason: r.reason,
        before: r.before,
        after: r.after,
        diff: r.diff,
        request_id: r.requestId,
        ip: r.ip,
        user_agent: r.userAgent,
        created_at: r.createdAt.toISOString(),
      })),
      meta: { page: { limit: parsed.limit, offset: parsed.offset, total } },
    };
  }
}
