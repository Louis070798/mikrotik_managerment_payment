import { Module } from '@nestjs/common';
import { ServiceEndpointsController } from './service-endpoints.controller';
import { ServiceEndpointsService } from './service-endpoints.service';

@Module({
  controllers: [ServiceEndpointsController],
  providers: [ServiceEndpointsService],
  exports: [ServiceEndpointsService],
})
export class ServiceEndpointsModule {}
