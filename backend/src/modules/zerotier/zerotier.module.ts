import { Module } from '@nestjs/common';
import { ZeroTierController } from './zerotier.controller';
import { ZeroTierService } from './zerotier.service';

@Module({
  controllers: [ZeroTierController],
  providers: [ZeroTierService],
})
export class ZeroTierModule {}
