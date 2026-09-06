import { Global, Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Global()
@Module({
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsLibModule {}
