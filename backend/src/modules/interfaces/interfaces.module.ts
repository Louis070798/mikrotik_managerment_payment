import { Module } from '@nestjs/common';
import { InterfacesController } from './interfaces.controller';
import { InterfacesService } from './interfaces.service';

@Module({
  controllers: [InterfacesController],
  providers: [InterfacesService],
  exports: [InterfacesService],
})
export class InterfacesModule {}
