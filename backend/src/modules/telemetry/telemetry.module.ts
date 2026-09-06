import { Module } from '@nestjs/common';
import { InventoryCacheModule } from '@inventory-cache/inventory-cache.module';
import { TelemetryNormalizeModule } from '@telemetry-normalize/telemetry-normalize.module';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [TelemetryNormalizeModule, InventoryCacheModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
