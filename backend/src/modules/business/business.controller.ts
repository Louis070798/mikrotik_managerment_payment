import { Controller, Get, Param, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodQuery } from '@common/zod-validation.pipe';
import { BusinessQuerySchema, BusinessRawRecordsQuerySchema } from './dto';
import { BusinessService } from './business.service';

@Controller('ships/:shipId/business')
export class BusinessController {
  constructor(private readonly service: BusinessService) {}

  @Get('devices')
  @RequirePermission('business:read')
  devices(@Param('shipId') shipId: string, @Query(zodQuery(BusinessQuerySchema)) query: ReturnType<typeof BusinessQuerySchema.parse>) {
    return this.service.listDevices(shipId, query);
  }

  @Get('usage')
  @RequirePermission('business:read')
  usage(@Param('shipId') shipId: string, @Query(zodQuery(BusinessQuerySchema)) query: ReturnType<typeof BusinessQuerySchema.parse>) {
    return this.service.getUsage(shipId, query);
  }

  @Get('flows')
  @RequirePermission('business:read')
  flows(@Param('shipId') shipId: string, @Query(zodQuery(BusinessQuerySchema)) query: ReturnType<typeof BusinessQuerySchema.parse>) {
    return this.service.getFlowsSummary(shipId, query);
  }

  @Get('flows/unknown')
  @RequirePermission('raw:read')
  flowsUnknown(@Param('shipId') shipId: string, @Query(zodQuery(BusinessRawRecordsQuerySchema)) query: ReturnType<typeof BusinessRawRecordsQuerySchema.parse>) {
    return this.service.getUnknownFlows(shipId, query);
  }

  @Get('raw-records')
  @RequirePermission('raw:read')
  rawRecords(@Param('shipId') shipId: string, @Query(zodQuery(BusinessRawRecordsQuerySchema)) query: ReturnType<typeof BusinessRawRecordsQuerySchema.parse>) {
    return this.service.getRawRecords(shipId, query);
  }
}
