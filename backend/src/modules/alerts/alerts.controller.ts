import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { AlertsService } from '@alerts-lib/alerts.service';
import { ApiException } from '@common/api-exception';
import { AckAlertSchema, ListAlertsQuerySchema, ResolveAlertSchema } from './dto';

function toApi(row: any) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    severity: row.severity,
    scope: row.scope,
    title: row.title,
    summary: row.summary,
    evidence: row.evidence,
    started_at: row.startedAt?.toISOString?.() ?? row.startedAt,
    acked_by: row.ackedBy,
    acked_at: row.ackedAt?.toISOString?.() ?? row.ackedAt ?? null,
    resolved_at: row.resolvedAt?.toISOString?.() ?? row.resolvedAt ?? null,
    resolve_reason: row.resolveReason,
  };
}

@Controller('alerts')
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  @RequirePermission('alert:read')
  async list(@Query() query: Record<string, string>) {
    const parsed = ListAlertsQuerySchema.parse(query);
    const { rows, total } = await this.service.list(parsed);
    return { data: rows.map(toApi), meta: { page: { limit: parsed.limit, offset: parsed.offset, total } } };
  }

  @Get(':id')
  @RequirePermission('alert:read')
  async getOne(@Param('id') id: string) {
    const row = await this.service.findById(id);
    if (!row) throw new ApiException('ALERT_NOT_FOUND', `Alert ${id} not found`);
    return toApi(row);
  }

  @Post(':id/ack')
  @RequirePermission('alert:ack')
  async ack(@Param('id') id: string, @Body(zodBody(AckAlertSchema)) body: ReturnType<typeof AckAlertSchema['parse']>) {
    const { ok } = await this.service.ack(id, body.note ?? null);
    if (!ok) throw new ApiException('ALERT_NOT_FOUND', `Alert ${id} not found or not in FIRING state`);
    return toApi(await this.service.findById(id));
  }

  @Post(':id/resolve')
  @RequirePermission('alert:ack')
  async resolve(@Param('id') id: string, @Body(zodBody(ResolveAlertSchema)) body: ReturnType<typeof ResolveAlertSchema['parse']>) {
    const { ok } = await this.service.resolve(id, body.reason);
    if (!ok) throw new ApiException('ALERT_NOT_FOUND', `Alert ${id} not found or already resolved`);
    return toApi(await this.service.findById(id));
  }
}
