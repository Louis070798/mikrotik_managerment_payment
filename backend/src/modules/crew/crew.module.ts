import { Module } from '@nestjs/common';
import { RadiusCoaModule } from '@radius-coa/radius-coa.module';
import { CrewController } from './crew.controller';
import { CrewService } from './crew.service';

@Module({
  imports: [RadiusCoaModule],
  controllers: [CrewController],
  providers: [CrewService],
  exports: [CrewService],
})
export class CrewModule {}
