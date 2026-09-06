import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermission } from '@auth-stub/auth-stub.guard';
import { zodBody, zodQuery } from '@common/zod-validation.pipe';
import { TelemetryIngestRequestSchema, TelemetrySourceSchema } from './dto';
import { TelemetryService } from './telemetry.service';

const NormalizeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  source: TelemetrySourceSchema.optional(),
});

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly service: TelemetryService) {}

  @Post('ingest')
  @RequirePermission('telemetry:ingest')
  ingest(@Body(zodBody(TelemetryIngestRequestSchema)) body: ReturnType<typeof TelemetryIngestRequestSchema.parse>) {
    return this.service.ingest(body);
  }

  @Get('health')
  @RequirePermission('telemetry:read')
  health() {
    return this.service.health();
  }

  // Manual catch-up/reprocess trigger — stand-in for the NATS consumer worker (see
  // NormalizationService). Ingest already normalizes synchronously; this exists for events left
  // pending after a transient failure, or for reprocessing after a parser_version bump.
  @Post('normalize')
  @HttpCode(200)
  @RequirePermission('telemetry:process')
  normalize(@Query(zodQuery(NormalizeQuerySchema)) query: ReturnType<typeof NormalizeQuerySchema.parse>) {
    return this.service.normalizePending(query);
  }
}
