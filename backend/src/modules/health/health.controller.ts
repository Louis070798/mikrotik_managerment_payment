import { Controller, Get, Param } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Get('summary')
  @RequirePermission('health:read')
  summary() {
    return this.service.summary();
  }

  @Get('services')
  @RequirePermission('health:read')
  listServices() {
    return this.service.listServices();
  }

  @Get('services/:serviceName')
  @RequirePermission('health:read')
  getService(@Param('serviceName') serviceName: string) {
    return this.service.getService(serviceName);
  }

  @Get('ha')
  @RequirePermission('health:read')
  ha() {
    return this.service.getHaSummary();
  }
}
