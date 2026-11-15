import { describe, it, expect } from 'vitest';
import {
  DELAY_AFTER_ERROR_MS,
  DELAY_WHEN_FRESH_MS,
  DELAY_WHILE_POPULATING_MS,
  isLocalAutoRefreshEnabled,
  nextDelayMs,
} from './local-auto-refresh';

describe('isLocalAutoRefreshEnabled', () => {
  it('is on by default in development and off in production', () => {
    expect(isLocalAutoRefreshEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isLocalAutoRefreshEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isLocalAutoRefreshEnabled({ NODE_ENV: 'test' })).toBe(false);
  });

  it('can be forced either way', () => {
    expect(isLocalAutoRefreshEnabled({ NODE_ENV: 'production', LOCAL_AUTO_REFRESH: '1' })).toBe(true);
    expect(isLocalAutoRefreshEnabled({ NODE_ENV: 'development', LOCAL_AUTO_REFRESH: '0' })).toBe(false);
  });
});

describe('nextDelayMs', () => {
  it('runs fast while profiles are still being filled in', () => {
    expect(nextDelayMs({ error: false, attempted: 5, updated: 5 })).toBe(DELAY_WHILE_POPULATING_MS);
  });

  it('slows right down once everything is fresh', () => {
    expect(nextDelayMs({ error: false, attempted: 0, updated: 0 })).toBe(DELAY_WHEN_FRESH_MS);
  });

  it('backs off a little when attempts update nothing (rate limit), and more after an error', () => {
    const limited = nextDelayMs({ error: false, attempted: 3, updated: 0 });
    expect(limited).toBeGreaterThan(DELAY_WHILE_POPULATING_MS);
    expect(limited).toBeLessThan(DELAY_AFTER_ERROR_MS);
    expect(nextDelayMs({ error: true, attempted: 0, updated: 0 })).toBe(DELAY_AFTER_ERROR_MS);
  });
});
