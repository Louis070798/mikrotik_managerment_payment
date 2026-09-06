import { Controller, Get, Param, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodQuery } from '@common/zod-validation.pipe';
import { DashboardQuerySchema, RawRecordsQuerySchema } from './dto';
import { DashboardService, ReconciliationService } from './dashboard.service';

@Controller()
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('dashboard/global')
  @RequirePermission('dashboard:read')
  global(@Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getGlobal(query);
  }

  @Get('areas/:areaId/dashboard')
  @RequirePermission('dashboard:read')
  area(@Param('areaId') areaId: string, @Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getArea(areaId, query);
  }

  @Get('ships/:shipId/dashboard')
  @RequirePermission('dashboard:read')
  ship(@Param('shipId') shipId: string, @Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getShip(shipId, query);
  }
}

@Controller()
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Get('dashboard/global/reconciliation')
  @RequirePermission('reconciliation:read')
  globalSummary(@Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getGlobalSummary(query);
  }

  @Get('ships/:shipId/reconciliation')
  @RequirePermission('reconciliation:read')
  summary(@Param('shipId') shipId: string, @Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getSummary(shipId, query);
  }

  @Get('ships/:shipId/reconciliation/by-wan')
  @RequirePermission('reconciliation:read')
  byWan(@Param('shipId') shipId: string, @Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getByWan(shipId, query);
  }

  @Get('ships/:shipId/reconciliation/by-interface')
  @RequirePermission('reconciliation:read')
  byInterface(@Param('shipId') shipId: string, @Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getByInterface(shipId, query);
  }

  @Get('ships/:shipId/reconciliation/by-zone')
  @RequirePermission('reconciliation:read')
  byZone(@Param('shipId') shipId: string, @Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getByZone(shipId, query);
  }

  @Get('ships/:shipId/reconciliation/raw-records')
  @RequirePermission('raw:read')
  rawRecords(@Param('shipId') shipId: string, @Query(zodQuery(RawRecordsQuerySchema)) query: ReturnType<typeof RawRecordsQuerySchema.parse>) {
    return this.service.getRawRecords(shipId, query);
  }

  @Get('ships/:shipId/reconciliation/timeseries')
  @RequirePermission('reconciliation:read')
  timeseries(@Param('shipId') shipId: string, @Query(zodQuery(DashboardQuerySchema)) query: ReturnType<typeof DashboardQuerySchema.parse>) {
    return this.service.getTimeseries(shipId, query);
  }
}
