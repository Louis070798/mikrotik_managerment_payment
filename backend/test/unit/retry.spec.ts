import { retryWithTimeout, DEFAULT_RETRY_OPTIONS, TimeoutError } from '@registry/retry';

describe('retryWithTimeout', () => {
  it('trả ok=true ngay lần thử đầu nếu fn thành công', async () => {
    const fn = jest.fn().mockResolvedValue('ok-value');
    const result = await retryWithTimeout(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 });
    expect(result.ok).toBe(true);
    expect(result.value).toBe('ok-value');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retry và thành công ở lần thử thứ 2', async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient failure');
      return 'recovered';
    });
    const result = await retryWithTimeout(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 });
    expect(result.ok).toBe(true);
    expect(result.value).toBe('recovered');
    expect(result.attempts).toBe(2);
    expect(result.attemptLog).toHaveLength(1);
    expect(result.attemptLog[0].error).toBe('transient failure');
  });

  it('trả ok=false sau khi hết maxAttempts, KHÔNG throw', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));
    const result = await retryWithTimeout(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(result.error?.message).toBe('always fails');
    expect(result.attemptLog).toHaveLength(3);
    // Lần cuối không có delay (không còn retry nữa).
    expect(result.attemptLog[2].delayMs).toBe(0);
  });

  it('mỗi attempt bị timeout riêng nếu fn không resolve kịp — trả TimeoutError, không treo test', async () => {
    const fn = jest.fn().mockImplementation(() => new Promise(() => {})); // không bao giờ resolve
    const result = await retryWithTimeout(fn, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 2, timeoutMs: 20 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(TimeoutError);
    expect(result.error?.message).toContain('20ms');
  }, 2000);

  it('backoff tăng dần qua các lần thử (trong khoảng jitter [0.5x, 1x] của exponential)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const result = await retryWithTimeout(fn, { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10_000 });
    const [d1, d2] = result.attemptLog.map((a) => a.delayMs);
    // attempt1 backoff nền = 100ms (jitter 50-100), attempt2 backoff nền = 200ms (jitter 100-200)
    expect(d1).toBeGreaterThanOrEqual(50);
    expect(d1).toBeLessThanOrEqual(100);
    expect(d2).toBeGreaterThanOrEqual(100);
    expect(d2).toBeLessThanOrEqual(200);
  });

  it('respect maxDelayMs — backoff không vượt trần dù attempt lớn', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    const result = await retryWithTimeout(fn, { maxAttempts: 6, baseDelayMs: 1000, maxDelayMs: 1500 });
    for (const log of result.attemptLog) {
      expect(log.delayMs).toBeLessThanOrEqual(1500);
    }
  });

  it('DEFAULT_RETRY_OPTIONS khớp với giá trị tài liệu hoá (maxAttempts=3, timeoutMs=5000)', () => {
    expect(DEFAULT_RETRY_OPTIONS.maxAttempts).toBe(3);
    expect(DEFAULT_RETRY_OPTIONS.timeoutMs).toBe(5000);
  });
});
