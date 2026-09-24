import { Module } from '@nestjs/common';
import { FreeradiusSyncModule } from '@freeradius-sync/freeradius-sync.module';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

@Module({
  imports: [FreeradiusSyncModule],
  controllers: [SubscribersController],
  providers: [SubscribersService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
