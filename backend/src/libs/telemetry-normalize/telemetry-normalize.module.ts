import { Module } from '@nestjs/common';
import { DnsResolutionCacheModule } from '@dns-resolution-cache/dns-resolution-cache.module';
import { NormalizationService } from './normalization.service';

@Module({
  imports: [DnsResolutionCacheModule],
  providers: [NormalizationService],
  exports: [NormalizationService],
})
export class TelemetryNormalizeModule {}
