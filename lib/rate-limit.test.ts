/**
 * Rate-limiter tests. The limiter falls back to disk KV when no Upstash
 * credentials are set, so these run hermetically in CI with unique keys.
 */
import { describe, it, expect } from 'vitest';
import { checkRateLimit, getClientIp, rateLimitedResponse } from './rate-limit';

const key = (name: string) => `test:rl:${name}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;

describe('checkRateLimit', () => {
  it('allows requests up to the limit, then denies with retryAfter', async () => {
    const k = key('basic');
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit(k, 3, 60);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(3 - i - 1);
    }
    const denied = await checkRateLimit(k, 3, 60);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfter).toBeGreaterThan(0);
  });

  it('resets after the window expires', async () => {
    const k = key('reset');
    await checkRateLimit(k, 1, 1);
    const denied = await checkRateLimit(k, 1, 1);
    expect(denied.allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    const again = await checkRateLimit(k, 1, 60);
    expect(again.allowed).toBe(true);
  });
});

describe('getClientIp', () => {
  it('prefers the first x-forwarded-for entry', () => {
    const req = new Request('http://x/', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('falls back to unknown', () => {
    expect(getClientIp(new Request('http://x/'))).toBe('unknown');
  });
});

describe('rateLimitedResponse', () => {
  it('returns 429 with a Retry-After header', async () => {
    const res = rateLimitedResponse(42);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    const body = (await res.json()) as { retryAfter: number };
    expect(body.retryAfter).toBe(42);
  });
});
