import { CircuitBreaker } from '@registry/circuit-breaker';

describe('CircuitBreaker', () => {
  const opts = { failureThreshold: 3, cooldownMs: 1000 };

  it('bắt đầu ở CLOSED và cho phép probe', () => {
    const cb = new CircuitBreaker(opts);
    expect(cb.snapshot().state).toBe('CLOSED');
    expect(cb.canProbe(0)).toBe(true);
  });

  it('mở (OPEN) sau khi đạt đủ failureThreshold lỗi liên tiếp', () => {
    const cb = new CircuitBreaker(opts);
    cb.onFailure(0);
    cb.onFailure(0);
    expect(cb.snapshot().state).toBe('CLOSED'); // chưa đủ ngưỡng
    cb.onFailure(0);
    expect(cb.snapshot().state).toBe('OPEN');
    expect(cb.snapshot().consecutiveFailures).toBe(3);
  });

  it('khi OPEN, từ chối probe cho tới khi hết cooldown', () => {
    const cb = new CircuitBreaker(opts);
    cb.onFailure(0);
    cb.onFailure(0);
    cb.onFailure(0); // -> OPEN tại t=0
    expect(cb.canProbe(500)).toBe(false); // còn trong cooldown (1000ms)
    expect(cb.canProbe(999)).toBe(false);
  });

  it('sau cooldown, chuyển sang HALF_OPEN và cho phép đúng 1 probe', () => {
    const cb = new CircuitBreaker(opts);
    cb.onFailure(0);
    cb.onFailure(0);
    cb.onFailure(0); // OPEN tại t=0

    expect(cb.canProbe(1000)).toBe(true); // hết cooldown -> HALF_OPEN, cho probe đầu tiên
    expect(cb.snapshot().state).toBe('HALF_OPEN');
    // Probe thứ 2 trong lúc probe đầu còn "in flight" phải bị từ chối.
    expect(cb.canProbe(1001)).toBe(false);
  });

  it('probe HALF_OPEN thành công -> CLOSED, reset consecutiveFailures', () => {
    const cb = new CircuitBreaker(opts);
    cb.onFailure(0);
    cb.onFailure(0);
    cb.onFailure(0);
    cb.canProbe(1000); // -> HALF_OPEN

    cb.onSuccess();
    const snap = cb.snapshot();
    expect(snap.state).toBe('CLOSED');
    expect(snap.consecutiveFailures).toBe(0);
    expect(snap.openedAt).toBeNull();
    expect(cb.canProbe(1001)).toBe(true);
  });

  it('probe HALF_OPEN thất bại -> quay lại OPEN với cooldown mới (openedAt reset)', () => {
    const cb = new CircuitBreaker(opts);
    cb.onFailure(0);
    cb.onFailure(0);
    cb.onFailure(0); // OPEN tại t=0
    cb.canProbe(1000); // -> HALF_OPEN tại t=1000

    cb.onFailure(1000); // probe thất bại
    const snap = cb.snapshot();
    expect(snap.state).toBe('OPEN');
    expect(snap.openedAt).toBe(1000);
    // Cooldown được tính lại từ mốc thất bại mới, không dùng mốc cũ.
    expect(cb.canProbe(1500)).toBe(false);
    expect(cb.canProbe(2000)).toBe(true);
  });

  it('static restore() khôi phục đúng trạng thái đã lưu (vd sau khi service restart)', () => {
    const cb = CircuitBreaker.restore(opts, { state: 'OPEN', consecutiveFailures: 5, openedAt: 12345 });
    const snap = cb.snapshot();
    expect(snap.state).toBe('OPEN');
    expect(snap.consecutiveFailures).toBe(5);
    expect(snap.openedAt).toBe(12345);
    expect(cb.canProbe(12345 + opts.cooldownMs)).toBe(true);
  });

  it('onSuccess trong khi CLOSED không có tác dụng phụ (idempotent)', () => {
    const cb = new CircuitBreaker(opts);
    cb.onSuccess();
    expect(cb.snapshot()).toEqual({ state: 'CLOSED', consecutiveFailures: 0, openedAt: null });
  });
});
