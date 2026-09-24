import { Module } from '@nestjs/common';
import { DbAaaModule } from '@db-aaa/db-aaa.module';
import { FreeradiusAaaService } from './freeradius-aaa.service';
import { FreeradiusSyncService } from './freeradius-sync.service';

@Module({
  imports: [DbAaaModule],
  providers: [FreeradiusSyncService, FreeradiusAaaService],
  exports: [FreeradiusSyncService, FreeradiusAaaService],
})
export class FreeradiusSyncModule {}
