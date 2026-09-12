import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { TenantsService } from './tenants.service';
import { CreateTenantSchema, ListTenantsQuerySchema, SetTenantPasswordSchema, UpdateTenantSchema } from './dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  @RequirePermission('tenant:read')
  list(@Query() query: Record<string, string>) {
    const parsed = ListTenantsQuerySchema.parse(query);
    return this.service.list({ parentId: parsed.parent_id });
  }

  @Get(':tenantId')
  @RequirePermission('tenant:read')
  getOne(@Param('tenantId') tenantId: string) {
    return this.service.getById(tenantId);
  }

  @Post()
  @RequirePermission('tenant:write')
  create(@Body(zodBody(CreateTenantSchema)) body: ReturnType<typeof CreateTenantSchema['parse']>) {
    return this.service.create(body);
  }

  @Patch(':tenantId')
  @RequirePermission('tenant:write')
  update(@Param('tenantId') tenantId: string, @Body(zodBody(UpdateTenantSchema)) body: ReturnType<typeof UpdateTenantSchema['parse']>) {
    return this.service.update(tenantId, body);
  }

  @Delete(':tenantId')
  @HttpCode(204)
  @RequirePermission('tenant:write')
  async remove(@Param('tenantId') tenantId: string) {
    await this.service.remove(tenantId);
  }

  @Post(':tenantId/password')
  @RequirePermission('tenant:write')
  setPassword(@Param('tenantId') tenantId: string, @Body(zodBody(SetTenantPasswordSchema)) body: ReturnType<typeof SetTenantPasswordSchema['parse']>) {
    return this.service.setPassword(tenantId, body.password);
  }

  @Delete(':tenantId/password')
  @HttpCode(204)
  @RequirePermission('tenant:write')
  async revokePassword(@Param('tenantId') tenantId: string) {
    await this.service.revokePassword(tenantId);
  }
}
