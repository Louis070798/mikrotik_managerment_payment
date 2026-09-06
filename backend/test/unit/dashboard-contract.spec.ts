import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import * as yaml from 'js-yaml';

// Route metadata can be inspected without loading the DB module/configuration.
jest.mock('../../src/modules/dashboard/dashboard.service', () => ({
  DashboardService: class DashboardService {},
  ReconciliationService: class ReconciliationService {},
}));

import { DashboardController, ReconciliationController } from '../../src/modules/dashboard/dashboard.controller';
import { DashboardQuerySchema } from '../../src/modules/dashboard/dto';
import {
  makeDataQuality,
  makeDashboardMeta,
  makeTelemetryWarnings,
  makeUnavailableAvailability,
  resolvePeriod,
} from '../../src/modules/dashboard/dashboard.contract';

function controllerRoutes(controller: Function): string[] {
  const metadataPath = (value: unknown): string => {
    const path = Array.isArray(value) ? value[0] : value;
    return typeof path === 'string' ? path : '';
  };
  const normalize = (value: string) => value.replace(/^\/+|\/+$/g, '').replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  const controllerPath = normalize(metadataPath(Reflect.getMetadata(PATH_METADATA, controller)));
  const methodMap: Record<number, string> = {
    [RequestMethod.GET]: 'get',
  };
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((name) => {
      const handler = controller.prototype[name];
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      const path = Reflect.getMetadata(PATH_METADATA, handler);
      if (methodMap[method] !== 'get') return [];
      const paths = Array.isArray(path) ? path : [path];
      return paths.map((route) => `${methodMap[method]} /${[controllerPath, normalize(metadataPath(route))].filter(Boolean).join('/')}`);
    });
}

describe('Phase 2 dashboard/reconciliation contract', () => {
  it('validates the query contract and enforces the 5,000-bucket guardrail', () => {
    const parsed = DashboardQuerySchema.parse({ granularity: '1h', timezone: 'Asia/Bangkok' });
    const period = resolvePeriod(parsed, 'UTC');
    expect(period.timezone).toBe('Asia/Bangkok');
    expect(period.granularity).toBe('1h');

    expect(() =>
      resolvePeriod(
        DashboardQuerySchema.parse({
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-02T00:00:00Z',
          granularity: '1m',
        }),
      ),
    ).not.toThrow();
    expect(() =>
      resolvePeriod(
        DashboardQuerySchema.parse({
          from: '2026-01-01T00:00:00Z',
          to: '2026-02-01T00:00:00Z',
          granularity: '1m',
        }),
      ),
    ).toThrow();
  });

  it('exposes explicit unavailable metadata instead of zero traffic', () => {
    const period = resolvePeriod(DashboardQuerySchema.parse({}), 'UTC');
    const availability = makeUnavailableAvailability('RECONCILIATION_UNAVAILABLE');
    const quality = makeDataQuality();
    const meta = makeDashboardMeta(period, makeTelemetryWarnings('INSUFFICIENT_DATA', 'missing telemetry'));

    expect(availability).toEqual(
      expect.objectContaining({ status: 'UNAVAILABLE', code: 'RECONCILIATION_UNAVAILABLE' }),
    );
    expect(availability.missing_sources).toEqual(['interface_counters', 'radius_accounting', 'ipfix']);
    expect(quality.score).toBeNull();
    expect(meta.data_freshness_seconds).toBeNull();
    expect(meta.freshness_by_source).toEqual({ interface_counters: null, radius_accounting: null, ipfix: null });
    expect(meta.warnings[0]).toEqual(expect.objectContaining({ code: 'INSUFFICIENT_DATA' }));
  });

  it('has every Phase 2 controller GET route declared in OpenAPI', () => {
    const openApiPath = join(__dirname, '..', '..', '..', 'contracts', 'openapi.yaml');
    const document = yaml.load(readFileSync(openApiPath, 'utf8')) as { paths: Record<string, Record<string, unknown>> };
    const actual = [...controllerRoutes(DashboardController), ...controllerRoutes(ReconciliationController)].sort();
    const expected = [
      'get /dashboard/global',
      'get /areas/{areaId}/dashboard',
      'get /ships/{shipId}/dashboard',
      'get /ships/{shipId}/reconciliation',
      'get /ships/{shipId}/reconciliation/by-wan',
      'get /ships/{shipId}/reconciliation/by-interface',
      'get /ships/{shipId}/reconciliation/by-zone',
      'get /ships/{shipId}/reconciliation/raw-records',
      'get /ships/{shipId}/reconciliation/timeseries',
    ].sort();

    expect(actual).toEqual(expected);
    for (const route of actual) {
      const [method, path] = route.split(' ');
      expect(document.paths[path]?.[method]).toBeDefined();
    }
  });
});
