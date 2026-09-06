import { Module } from '@nestjs/common';
import { DnsResolutionCacheModule } from '@dns-resolution-cache/dns-resolution-cache.module';
import { InventoryCacheModule } from '@inventory-cache/inventory-cache.module';
import { DnsLogCollectorService } from './dns-log-collector.service';

@Module({
  imports: [DnsResolutionCacheModule, InventoryCacheModule],
  providers: [DnsLogCollectorService],
})
export class DnsLogCollectorModule {}
