import { Module } from '@nestjs/common';
import { FreeradiusSyncModule } from '@freeradius-sync/freeradius-sync.module';
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
  imports: [FreeradiusSyncModule, TelemetryModule, SecretsModule, InventoryCacheModule],
  controllers: [AreasController, ShipsController, DevicesController],
  providers: [AreasService, ShipsService, DevicesService],
  exports: [AreasService, ShipsService, DevicesService],
})
export class InventoryModule {}
