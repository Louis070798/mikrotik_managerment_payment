import { Module } from '@nestjs/common';
import { IngestConcurrencyLimiterService } from './ingest-concurrency-limiter.service';

@Module({
  providers: [IngestConcurrencyLimiterService],
  exports: [IngestConcurrencyLimiterService],
})
export class IngestThrottleModule {}
