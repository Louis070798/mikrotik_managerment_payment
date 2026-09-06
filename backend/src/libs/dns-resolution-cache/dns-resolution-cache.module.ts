import { Module } from '@nestjs/common';
import { DnsResolutionCacheService } from './dns-resolution-cache.service';

@Module({
  providers: [DnsResolutionCacheService],
  exports: [DnsResolutionCacheService],
})
export class DnsResolutionCacheModule {}
