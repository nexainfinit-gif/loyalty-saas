import { rateLimit, getClientIp } from '@/lib/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    // Each test gets a unique prefix so the shared in-memory store
    // doesn't leak state between tests.
    vi.useRealTimers();
  });

  it('allows requests up to the limit', () => {
    const limiter = rateLimit({ prefix: 'test-allow', limit: 3, windowMs: 10_000 });

    expect(limiter.check('ip1').success).toBe(true);
    expect(limiter.check('ip1').success).toBe(true);
    expect(limiter.check('ip1').success).toBe(true);
  });

  it('blocks the request at limit + 1', () => {
    const limiter = rateLimit({ prefix: 'test-block', limit: 3, windowMs: 10_000 });

    limiter.check('ip1');
    limiter.check('ip1');
    limiter.check('ip1');

    const result = limiter.check('ip1');
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('returns correct remaining count that decrements each call', () => {
    const limiter = rateLimit({ prefix: 'test-remaining', limit: 5, windowMs: 10_000 });

    expect(limiter.check('ip1').remaining).toBe(4); // 5 - 1
    expect(limiter.check('ip1').remaining).toBe(3); // 5 - 2
    expect(limiter.check('ip1').remaining).toBe(2); // 5 - 3
    expect(limiter.check('ip1').remaining).toBe(1); // 5 - 4
    expect(limiter.check('ip1').remaining).toBe(0); // 5 - 5

    // Next call is blocked
    const blocked = limiter.check('ip1');
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('isolates different keys from each other', () => {
    const limiter = rateLimit({ prefix: 'test-isolation', limit: 2, windowMs: 10_000 });

    // Exhaust key A
    limiter.check('keyA');
    limiter.check('keyA');
    expect(limiter.check('keyA').success).toBe(false);

    // Key B should still be allowed
    const resultB = limiter.check('keyB');
    expect(resultB.success).toBe(true);
    expect(resultB.remaining).toBe(1);
  });

  it('restores capacity after the window expires', () => {
    vi.useFakeTimers();

    const windowMs = 5_000;
    const limiter = rateLimit({ prefix: 'test-expiry', limit: 2, windowMs });

    limiter.check('ip1');
    limiter.check('ip1');
    expect(limiter.check('ip1').success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    const result = limiter.check('ip1');
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);

    vi.useRealTimers();
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
    });
    expect(getClientIp(request)).toBe('1.2.3.4');
  });

  it('extracts IP from x-real-ip header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-real-ip': '5.6.7.8' },
    });
    expect(getClientIp(request)).toBe('5.6.7.8');
  });

  it('returns "unknown" when no IP headers are present', () => {
    const request = new Request('http://localhost');
    expect(getClientIp(request)).toBe('unknown');
  });
});
