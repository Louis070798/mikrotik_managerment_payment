import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import * as yaml from 'js-yaml';

jest.mock('../../src/modules/telemetry/telemetry.service', () => ({
  TelemetryService: class TelemetryService {},
}));

import { TelemetryController } from '../../src/modules/telemetry/telemetry.controller';
import { hashTelemetryPayload, sourceHealth } from '../../src/modules/telemetry/contract';
import { TelemetryEventSchema, TelemetryIngestRequestSchema } from '../../src/modules/telemetry/dto';

function controllerRoutes(controller: Function): string[] {
  const methodMap: Record<number, string> = { [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post' };
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((name) => {
      const handler = controller.prototype[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      const path = Reflect.getMetadata(PATH_METADATA, handler);
      const route = Array.isArray(path) ? path[0] : path;
      const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) || '';
      return methodMap[method] && typeof route === 'string' ? [`${methodMap[method]} /${[controllerPath, route].filter(Boolean).join('/')}`] : [];
    });
}

describe('Phase 3 raw telemetry contract', () => {
  it('validates source-specific raw payload requirements', () => {
    const counter = TelemetryEventSchema.parse({
      source: 'INTERFACE_COUNTER',
      idempotency_key: 'counter-1',
      observed_at: '2026-08-25T01:00:00Z',
      payload: { interface_name: 'ether1', rx_bytes: 100, tx_bytes: 200 },
    });
    expect(counter.identity).toEqual({});

    expect(() =>
      TelemetryEventSchema.parse({
        source: 'IPFIX_FLOW',
        idempotency_key: 'flow-1',
        observed_at: '2026-08-25T01:00:00Z',
        payload: { packets: 2 },
      }),
    ).toThrow();
    expect(() =>
      TelemetryEventSchema.parse({
        source: 'RADIUS_ACCOUNTING',
        idempotency_key: 'radius-1',
        observed_at: '2026-08-25T01:00:00Z',
      }),
    ).toThrow();
  });

  it('accepts a raw reference when payload is stored externally and bounds batches', () => {
    const request = TelemetryIngestRequestSchema.parse({
      events: [
        {
          source: 'IPFIX_FLOW',
          idempotency_key: 'flow-ref-1',
          observed_at: '2026-08-25T01:00:00Z',
          raw_reference: 's3://raw/ship-1/flow-1.json',
        },
      ],
    });
    expect(request.events[0].raw_reference).toContain('s3://');
    expect(() => TelemetryIngestRequestSchema.parse({ events: [] })).toThrow();
  });

  it('hashes equivalent payloads deterministically and reports empty/stale health honestly', () => {
    expect(hashTelemetryPayload({ b: 2, a: 1 }, undefined)).toBe(hashTelemetryPayload({ a: 1, b: 2 }, undefined));
    const now = new Date('2026-08-25T02:00:00Z');
    expect(sourceHealth('RADIUS_ACCOUNTING', 0, null, now).status).toBe('UNKNOWN');
    expect(sourceHealth('IPFIX_FLOW', 1, new Date('2026-08-25T01:50:00Z'), now).status).toBe('DEGRADED');
  });

  it('declares all telemetry routes in OpenAPI', () => {
    const openApiPath = join(__dirname, '..', '..', '..', 'contracts', 'openapi.yaml');
    const document = yaml.load(readFileSync(openApiPath, 'utf8')) as { paths: Record<string, Record<string, unknown>> };
    const routes = controllerRoutes(TelemetryController);
    // Phase 4 added POST /telemetry/normalize (manual catch-up/reprocess trigger — see
    // NormalizationService) alongside the original Phase 3 ingest/health routes.
    expect(routes.sort()).toEqual(['get /telemetry/health', 'post /telemetry/ingest', 'post /telemetry/normalize']);
    expect(document.paths['/telemetry/health']?.get).toBeDefined();
    expect(document.paths['/telemetry/ingest']?.post).toBeDefined();
    expect(document.paths['/telemetry/normalize']?.post).toBeDefined();
  });
});
