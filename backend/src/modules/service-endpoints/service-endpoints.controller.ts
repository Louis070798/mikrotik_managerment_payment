import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody } from '@common/zod-validation.pipe';
import { ServiceEndpointsService } from './service-endpoints.service';
import { CreateEndpointSchema, ListEndpointsQuerySchema, MaintenanceSchema, UpdateEndpointSchema } from './dto';

@Controller()
export class ServiceEndpointsController {
  constructor(private readonly service: ServiceEndpointsService) {}

  @Get('services')
  @RequirePermission('endpoint:read')
  listServiceNames() {
    return this.service.listServiceNames();
  }

  @Get('service-endpoints')
  @RequirePermission('endpoint:read')
  list(@Query() query: Record<string, string>) {
    const parsed = ListEndpointsQuerySchema.parse(query);
    return this.service.list({
      serviceName: parsed.service_name,
      environment: parsed.environment,
      enabled: parsed.enabled === undefined ? undefined : parsed.enabled === 'true',
    });
  }

  @Get('service-endpoints/:id')
  @RequirePermission('endpoint:read')
  getOne(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post('services/:serviceName/endpoints')
  @RequirePermission('endpoint:write')
  create(@Param('serviceName') serviceName: string, @Body(zodBody(CreateEndpointSchema)) body: ReturnType<typeof CreateEndpointSchema['parse']>) {
    return this.service.create(serviceName, body);
  }

  @Patch('service-endpoints/:id')
  @RequirePermission('endpoint:write')
  update(@Param('id') id: string, @Body(zodBody(UpdateEndpointSchema)) body: ReturnType<typeof UpdateEndpointSchema['parse']>) {
    return this.service.update(id, body);
  }

  @Delete('service-endpoints/:id')
  @HttpCode(204)
  @RequirePermission('endpoint:write')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
  }

  @Post('service-endpoints/:id/check')
  @RequirePermission('endpoint:read')
  check(@Param('id') id: string) {
    return this.service.triggerCheck(id);
  }

  @Post('service-endpoints/:id/enable')
  @RequirePermission('endpoint:write')
  enable(@Param('id') id: string) {
    return this.service.setEnabled(id, true);
  }

  @Post('service-endpoints/:id/disable')
  @RequirePermission('endpoint:write')
  disable(@Param('id') id: string) {
    return this.service.setEnabled(id, false);
  }

  @Post('service-endpoints/:id/maintenance')
  @RequirePermission('endpoint:write')
  maintenance(@Param('id') id: string, @Body(zodBody(MaintenanceSchema)) body: ReturnType<typeof MaintenanceSchema['parse']>) {
    return this.service.setMaintenance(id, body);
  }

  @Get('service-endpoints/:id/revisions')
  @RequirePermission('endpoint:read')
  revisions(@Param('id') id: string) {
    return this.service.listRevisions(id);
  }
}
