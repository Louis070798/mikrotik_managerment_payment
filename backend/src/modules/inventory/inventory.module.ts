import { Module } from '@nestjs/common';
import { SecretsModule } from '@secrets/secrets.module';
import { InventoryCacheModule } from '@inventory-cache/inventory-cache.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { ShipsController } from './ships.controller';
import { ShipsService } from './ships.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [TelemetryModule, SecretsModule, InventoryCacheModule],
  controllers: [AreasController, ShipsController, DevicesController],
  providers: [AreasService, ShipsService, DevicesService],
  exports: [AreasService, ShipsService, DevicesService],
})
export class InventoryModule {}
