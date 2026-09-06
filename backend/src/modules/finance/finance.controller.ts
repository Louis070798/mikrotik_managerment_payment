import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodQuery } from '@common/zod-validation.pipe';
import { FinanceQuerySchema } from './dto';
import { FinanceService } from './finance.service';

@Controller()
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get('dashboard/global/finance')
  @RequirePermission('finance:read')
  globalSummary(@Query(zodQuery(FinanceQuerySchema)) query: ReturnType<typeof FinanceQuerySchema.parse>) {
    return this.service.getGlobalSummary(query);
  }
}
