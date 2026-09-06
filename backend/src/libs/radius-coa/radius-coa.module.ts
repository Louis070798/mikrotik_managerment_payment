import { Module } from '@nestjs/common';
import { RadiusCoaService } from './radius-coa.service';

@Module({
  providers: [RadiusCoaService],
  exports: [RadiusCoaService],
})
export class RadiusCoaModule {}
