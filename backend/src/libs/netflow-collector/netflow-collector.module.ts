import { Module } from '@nestjs/common';
import { InventoryCacheModule } from '@inventory-cache/inventory-cache.module';
import { IngestThrottleModule } from '@ingest-throttle/ingest-throttle.module';
import { TelemetryModule } from '../../modules/telemetry/telemetry.module';
import { NetflowCollectorService } from './netflow-collector.service';

@Module({
  imports: [TelemetryModule, InventoryCacheModule, IngestThrottleModule],
  providers: [NetflowCollectorService],
})
export class NetflowCollectorModule {}
