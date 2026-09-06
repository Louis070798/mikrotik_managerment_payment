import { Module } from '@nestjs/common';
import { InventoryCacheModule } from '@inventory-cache/inventory-cache.module';
import { TelemetryModule } from '../../modules/telemetry/telemetry.module';
import { NetflowCollectorService } from './netflow-collector.service';

@Module({
  imports: [TelemetryModule, InventoryCacheModule],
  providers: [NetflowCollectorService],
})
export class NetflowCollectorModule {}
