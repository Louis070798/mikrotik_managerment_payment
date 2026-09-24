import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission, TenantScoped } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { SubscribersService } from './subscribers.service';
import { BulkAssignSchema, CreateSubscriberSchema, ListSubscribersQuerySchema, SetSubscriberPasswordSchema, UpdateSubscriberSchema } from './dto';

@Controller('subscribers')
export class SubscribersController {
  constructor(private readonly service: SubscribersService) {}

  @Get()
  @RequirePermission('subscriber:read')
  @TenantScoped()
  list(@Query() query: Record<string, string>) {
    const parsed = ListSubscribersQuerySchema.parse(query);
    return this.service.list({ tenantId: parsed.tenant_id, nasDeviceId: parsed.nas_device_id, status: parsed.status, q: parsed.q, limit: parsed.limit });
  }

  @Post('bulk-assign')
  @RequirePermission('subscriber:write')
  @TenantScoped()
  bulkAssign(@Body(zodBody(BulkAssignSchema)) body: ReturnType<typeof BulkAssignSchema['parse']>) {
    return this.service.bulkAssign(body);
  }

  @Get(':subscriberId')
  @RequirePermission('subscriber:read')
  @TenantScoped()
  getOne(@Param('subscriberId') subscriberId: string) {
    return this.service.getById(subscriberId);
  }

  @Post()
  @RequirePermission('subscriber:write')
  @TenantScoped()
  create(@Body(zodBody(CreateSubscriberSchema)) body: ReturnType<typeof CreateSubscriberSchema['parse']>) {
    return this.service.create(body);
  }

  @Patch(':subscriberId')
  @RequirePermission('subscriber:write')
  @TenantScoped()
  update(
    @Param('subscriberId') subscriberId: string,
    @Body(zodBody(UpdateSubscriberSchema)) body: ReturnType<typeof UpdateSubscriberSchema['parse']>,
  ) {
    return this.service.update(subscriberId, body);
  }

  @Delete(':subscriberId')
  @HttpCode(204)
  @RequirePermission('subscriber:write')
  @TenantScoped()
  async remove(@Param('subscriberId') subscriberId: string) {
    await this.service.remove(subscriberId);
  }

  @Post(':subscriberId/reset-quota')
  @RequirePermission('subscriber:write')
  @TenantScoped()
  resetQuota(@Param('subscriberId') subscriberId: string) {
    return this.service.resetQuota(subscriberId);
  }

  @Post(':subscriberId/password')
  @RequirePermission('subscriber:write')
  @TenantScoped()
  setPassword(
    @Param('subscriberId') subscriberId: string,
    @Body(zodBody(SetSubscriberPasswordSchema)) body: ReturnType<typeof SetSubscriberPasswordSchema['parse']>,
  ) {
    return this.service.setPassword(subscriberId, body.password);
  }

  @Delete(':subscriberId/password')
  @HttpCode(204)
  @RequirePermission('subscriber:write')
  @TenantScoped()
  async revokePassword(@Param('subscriberId') subscriberId: string) {
    await this.service.revokePassword(subscriberId);
  }
}
