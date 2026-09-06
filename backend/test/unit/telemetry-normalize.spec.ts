import { combineOctets, computeCounterDelta } from '../../src/libs/telemetry-normalize/gigawords';
import { GRANULARITY_SECONDS, bucketSql } from '../../src/libs/telemetry-normalize/aggregation';
import { interfaceCounterDeltas } from '../../src/libs/db-control/schema';

/**
 * Pure-function unit tests for ADR-09 (gigawords/unit semantics) and ADR-10 (delta/counter-reset
 * engine) — the two formulas the phase mandate is most explicit about never getting wrong. No DB,
 * no NestJS bootstrap: these are plain functions by design so they can be checked in isolation.
 */
describe('gigawords.ts — ADR-09 combineOctets', () => {
  it('combines octets + gigawords*2^32', () => {
    expect(combineOctets(100, 0)).toBe(100);
    expect(combineOctets(100, 1)).toBe(100 + 4294967296);
    expect(combineOctets(0, 2)).toBe(2 * 4294967296);
  });

  it('defaults missing gigawords to 0 rather than fabricating a value', () => {
    expect(combineOctets(500, null)).toBe(500);
    expect(combineOctets(500, undefined)).toBe(500);
  });

  it('propagates null octets as null (never coerced to 0)', () => {
    expect(combineOctets(null, 1)).toBeNull();
    expect(combineOctets(undefined, 1)).toBeNull();
  });

  it('accepts bigint octets', () => {
    expect(combineOctets(100n, 0)).toBe(100);
  });
});

describe('gigawords.ts — ADR-10 computeCounterDelta', () => {
  it('computes a normal GOOD delta within the poll interval', () => {
    const result = computeCounterDelta({ currentBytes: 1_005_000, previousBytes: 1_000_000, elapsedSeconds: 60, pollIntervalSeconds: 60 });
    expect(result).toEqual({ deltaBytes: 5000, counterReset: false, quality: 'GOOD' });
  });

  it('detects a counter reset (current < previous) and uses current as the delta', () => {
    const result = computeCounterDelta({ currentBytes: 500, previousBytes: 1_000_000, elapsedSeconds: 60, pollIntervalSeconds: 60 });
    expect(result.counterReset).toBe(true);
    expect(result.deltaBytes).toBe(500);
    expect(result.quality).toBe('DEGRADED');
  });

  it('flags DEGRADED when the gap is more than 3x the poll interval, without interpolating', () => {
    const result = computeCounterDelta({ currentBytes: 2000, previousBytes: 1000, elapsedSeconds: 61 * 4, pollIntervalSeconds: 60 });
    expect(result.counterReset).toBe(false);
    expect(result.deltaBytes).toBe(1000); // still a plain difference — no gap-fill/estimate
    expect(result.quality).toBe('DEGRADED');
  });

  it('treats an exactly-3x gap as still GOOD (boundary is strictly greater-than)', () => {
    const result = computeCounterDelta({ currentBytes: 2000, previousBytes: 1000, elapsedSeconds: 180, pollIntervalSeconds: 60 });
    expect(result.quality).toBe('GOOD');
  });

  it('does not flag a gap as too-large when pollIntervalSeconds is 0/unset (guards div-by-zero-style misuse)', () => {
    const result = computeCounterDelta({ currentBytes: 2000, previousBytes: 1000, elapsedSeconds: 999, pollIntervalSeconds: 0 });
    expect(result.quality).toBe('GOOD');
  });

  it('equal current/previous counters produce a zero delta, not a reset', () => {
    const result = computeCounterDelta({ currentBytes: 1000, previousBytes: 1000, elapsedSeconds: 60, pollIntervalSeconds: 60 });
    expect(result).toEqual({ deltaBytes: 0, counterReset: false, quality: 'GOOD' });
  });
});

describe('aggregation.ts — bucket granularities', () => {
  it('defines the four required granularities: 1m, 5m, 1h, 1d', () => {
    expect(GRANULARITY_SECONDS).toEqual({ '1m': 60, '5m': 300, '1h': 3600, '1d': 86400 });
  });

  it('bucketSql produces a SQL fragment for each supported granularity without throwing', () => {
    for (const granularity of Object.keys(GRANULARITY_SECONDS) as Array<keyof typeof GRANULARITY_SECONDS>) {
      const fragment = bucketSql(interfaceCounterDeltas.bucket, granularity, 'UTC');
      expect(fragment).toBeDefined();
    }
  });
});
