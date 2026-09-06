import { Module } from '@nestjs/common';
import { DashboardController, ReconciliationController } from './dashboard.controller';
import { DashboardService, ReconciliationService } from './dashboard.service';

@Module({
  controllers: [DashboardController, ReconciliationController],
  providers: [DashboardService, ReconciliationService],
  exports: [DashboardService, ReconciliationService],
})
export class DashboardModule {}
