import { Module } from '@nestjs/common';
import { InventoryCacheService } from './inventory-cache.service';

@Module({
  providers: [InventoryCacheService],
  exports: [InventoryCacheService],
})
export class InventoryCacheModule {}
