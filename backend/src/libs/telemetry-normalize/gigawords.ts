/**
 * ADR-09 unit semantics, pure helpers — no I/O so these are trivial to unit test in isolation.
 */

const TWO_POW_32 = 4294967296;

/** octets + gigawords*2^32 (ADR-09). Never skip gigawords — every session over 4GB is wrong without it. */
export function combineOctets(octets: number | bigint | null | undefined, gigawords: number | null | undefined): number | null {
  if (octets === null || octets === undefined) return null;
  const o = typeof octets === 'bigint' ? Number(octets) : octets;
  const g = gigawords ?? 0;
  return o + g * TWO_POW_32;
}

export type CounterDeltaInput = {
  currentBytes: number;
  previousBytes: number;
  elapsedSeconds: number;
  pollIntervalSeconds: number;
};

export type CounterDeltaResult = {
  deltaBytes: number;
  counterReset: boolean;
  quality: 'GOOD' | 'DEGRADED';
};

/**
 * ADR-10 delta engine.
 *   delta = current - previous
 *   current < previous  -> counter_reset=true, delta=current, quality=DEGRADED
 *   gap_seconds > 3 * poll_interval -> quality=DEGRADED (no interpolation — caller must not gapfill)
 */
export function computeCounterDelta(input: CounterDeltaInput): CounterDeltaResult {
  const { currentBytes, previousBytes, elapsedSeconds, pollIntervalSeconds } = input;
  const counterReset = currentBytes < previousBytes;
  const deltaBytes = counterReset ? currentBytes : currentBytes - previousBytes;
  const gapTooLarge = pollIntervalSeconds > 0 && elapsedSeconds > 3 * pollIntervalSeconds;
  const quality: 'GOOD' | 'DEGRADED' = counterReset || gapTooLarge ? 'DEGRADED' : 'GOOD';
  return { deltaBytes, counterReset, quality };
}
