import {
  crewIdentityCapability,
  displaySessionStatus,
  serviceUsageCapability,
  STALE_AFTER_SECONDS,
} from '../../src/modules/crew/contract';
import { businessIdentityCapability, CLASSIFICATION_NO_DNS_MATCH_REASON } from '../../src/modules/business/contract';
import { computeGap } from '../../src/modules/dashboard/dashboard.service';

describe('CREW contract — identity/service-usage capability (honest unavailability)', () => {
  it('always reports RADIUS-derived identity as AVAILABLE for CREW (never fabricated, never hidden)', () => {
    expect(crewIdentityCapability()).toEqual({
      status: 'AVAILABLE',
      method: 'RADIUS',
      message: expect.any(String),
    });
  });

  it('reports NOT_AVAILABLE/NO_CLASSIFIED_FLOWS_IN_PERIOD when no flow in the period was DNS-classified', () => {
    expect(serviceUsageCapability(false)).toEqual({
      status: 'NOT_AVAILABLE',
      reason: 'NO_CLASSIFIED_FLOWS_IN_PERIOD',
      message: expect.any(String),
    });
  });

  it('reports AVAILABLE/DNS once at least 1 flow in the period was DNS-classified', () => {
    expect(serviceUsageCapability(true)).toEqual({
      status: 'AVAILABLE',
      method: 'DNS',
      message: expect.any(String),
    });
  });
});

describe('CREW contract — displaySessionStatus (read-time STALE computation)', () => {
  const now = new Date('2026-08-25T12:00:00Z');

  it('leaves non-ACTIVE statuses untouched', () => {
    expect(displaySessionStatus('CLOSED', new Date('2026-08-25T11:00:00Z'), now)).toBe('CLOSED');
    expect(displaySessionStatus('ORPHANED', null, now)).toBe('ORPHANED');
  });

  it('keeps ACTIVE as ACTIVE when last activity is within STALE_AFTER_SECONDS', () => {
    const recent = new Date(now.getTime() - (STALE_AFTER_SECONDS - 60) * 1000);
    expect(displaySessionStatus('ACTIVE', recent, now)).toBe('ACTIVE');
  });

  it('flips ACTIVE to STALE once last activity exceeds STALE_AFTER_SECONDS', () => {
    const old = new Date(now.getTime() - (STALE_AFTER_SECONDS + 60) * 1000);
    expect(displaySessionStatus('ACTIVE', old, now)).toBe('STALE');
  });

  it('an ACTIVE session with no lastActivityAt is left as-is (never fabricated to STALE or ACTIVE)', () => {
    expect(displaySessionStatus('ACTIVE', null, now)).toBe('ACTIVE');
  });
});

describe('BUSINESS contract — SYSTEM_SPEC §4.3 no default user-level identity', () => {
  it('always reports NOT_AVAILABLE/NONE — BUSINESS has no identity by default', () => {
    expect(businessIdentityCapability()).toEqual({
      status: 'NOT_AVAILABLE',
      method: 'NONE',
      message: expect.any(String),
    });
  });

  it('exposes the same NO_DNS_RECORD reason code used when a period has zero DNS-classified flows', () => {
    expect(CLASSIFICATION_NO_DNS_MATCH_REASON).toBe('NO_DNS_RECORD');
  });
});

describe('Reconciliation — computeGap (never converts null to 0)', () => {
  it('computes a positive gap and rounds gap_pct to 2 decimals', () => {
    const { gapBytes, gapPct } = computeGap(1000, 900);
    expect(gapBytes).toBe(100);
    expect(gapPct).toBe(10);
  });

  it('propagates null when either side is unmeasured — NEVER substitutes 0', () => {
    expect(computeGap(null, 900)).toEqual({ gapBytes: null, gapPct: null });
    expect(computeGap(1000, null)).toEqual({ gapBytes: null, gapPct: null });
    expect(computeGap(null, null)).toEqual({ gapBytes: null, gapPct: null });
  });

  it('a real measured zero (both sides genuinely 0) yields a zero gap without dividing by zero', () => {
    expect(computeGap(0, 0)).toEqual({ gapBytes: 0, gapPct: null });
  });

  it('a negative gap (reported exceeds measured) is preserved, not clamped', () => {
    const { gapBytes, gapPct } = computeGap(900, 1000);
    expect(gapBytes).toBe(-100);
    expect(gapPct).toBeCloseTo(-11.11, 2);
  });
});
