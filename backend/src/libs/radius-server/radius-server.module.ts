import { Module } from '@nestjs/common';
import { InventoryCacheModule } from '@inventory-cache/inventory-cache.module';
import { IngestThrottleModule } from '@ingest-throttle/ingest-throttle.module';
import { TelemetryModule } from '../../modules/telemetry/telemetry.module';
import { RadiusServerService } from './radius-server.service';

@Module({
  imports: [TelemetryModule, InventoryCacheModule, IngestThrottleModule],
  providers: [RadiusServerService],
})
export class RadiusServerModule {}
