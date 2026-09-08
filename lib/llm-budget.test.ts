/**
 * Budget tests. The numbers here are load-bearing: the free tier gives 1,000
 * provider requests per day for the whole deployment, shared by chat and the
 * agent, so a wrong ceiling either overspends or refuses students who are
 * doing nothing wrong. Both failure modes were observed during development.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const kvStore = new Map<string, unknown>();

vi.mock('@/lib/kv', () => ({
  kvGet: async (key: string) => (kvStore.has(key) ? kvStore.get(key) : null),
  kvSet: async (key: string, value: unknown) => {
    kvStore.set(key, value);
    return true;
  },
  kvDel: async (key: string) => {
    kvStore.delete(key);
    return true;
  },
}));

import {
  AGENT_USER_BURST,
  AGENT_USER_DAILY,
  CHAT_USER_BURST,
  CHAT_USER_DAILY,
  PROVIDER_DAILY_REQUESTS,
  globalDailyBudget,
  globalMinuteBudget,
  refundProviderCalls,
  reserveProviderCalls,
} from './llm-budget';

const DAY_KEY = 'rl:llm:global:day';
const dayCount = () => (kvStore.get(DAY_KEY) as { count: number } | undefined)?.count ?? 0;

beforeEach(() => kvStore.clear());
afterEach(() => {
  delete process.env.LLM_DAILY_BUDGET;
  delete process.env.LLM_MINUTE_BUDGET;
});

describe('ceilings stay inside the measured free tier', () => {
  it('keeps the global daily ceiling below the provider’s own limit', () => {
    expect(globalDailyBudget()).toBeLessThan(PROVIDER_DAILY_REQUESTS);
  });

  it('cannot let one student exhaust the day alone', () => {
    // Worst case: every agent run burns all four provider calls.
    expect(AGENT_USER_DAILY * 4).toBeLessThan(globalDailyBudget());
    expect(CHAT_USER_DAILY).toBeLessThan(globalDailyBudget());
  });

  it('lets a student ask several questions in a row', () => {
    // The regression: a per-minute ceiling counted in worst-case calls
    // refused a student's SECOND question with the provider idle.
    expect(globalMinuteBudget()).toBeGreaterThanOrEqual(AGENT_USER_BURST);
    expect(AGENT_USER_BURST).toBeGreaterThan(1);
    expect(CHAT_USER_BURST).toBeGreaterThan(1);
  });

  it('reads overrides from the environment', () => {
    process.env.LLM_DAILY_BUDGET = '123';
    process.env.LLM_MINUTE_BUDGET = '7';
    expect(globalDailyBudget()).toBe(123);
    expect(globalMinuteBudget()).toBe(7);
  });

  it('ignores nonsense overrides rather than disabling the ceiling', () => {
    for (const bad of ['0', '-5', 'lots', '']) {
      process.env.LLM_DAILY_BUDGET = bad;
      expect(globalDailyBudget()).toBeGreaterThan(0);
    }
  });
});

describe('reserveProviderCalls', () => {
  it('charges the worst case to the day counter up front', async () => {
    await reserveProviderCalls(4);
    expect(dayCount()).toBe(4);
  });

  it('charges the minute counter one unit per request, not per call', async () => {
    await reserveProviderCalls(4);
    await reserveProviderCalls(4);
    const minute = kvStore.get('rl:llm:global:minute') as { count: number };
    expect(minute.count).toBe(2);
  });

  it('allows two agent runs back to back', async () => {
    expect((await reserveProviderCalls(4)).allowed).toBe(true);
    expect((await reserveProviderCalls(4)).allowed).toBe(true);
  });

  it('refuses once the daily ceiling is reached, reporting scope=day', async () => {
    process.env.LLM_DAILY_BUDGET = '8';
    expect((await reserveProviderCalls(4)).allowed).toBe(true);
    expect((await reserveProviderCalls(4)).allowed).toBe(true);
    const denied = await reserveProviderCalls(4);
    expect(denied.allowed).toBe(false);
    expect(denied.scope).toBe('day');
    expect(denied.retryAfter).toBeGreaterThan(0);
  });

  it('refuses a stampede, reporting scope=minute', async () => {
    process.env.LLM_MINUTE_BUDGET = '2';
    await reserveProviderCalls(1);
    await reserveProviderCalls(1);
    const denied = await reserveProviderCalls(1);
    expect(denied.allowed).toBe(false);
    expect(denied.scope).toBe('minute');
  });

  it('does not charge the day when the minute gate refuses first', async () => {
    process.env.LLM_MINUTE_BUDGET = '1';
    await reserveProviderCalls(4);
    const before = dayCount();
    await reserveProviderCalls(4);
    expect(dayCount()).toBe(before);
  });
});

describe('refundProviderCalls', () => {
  it('returns the unused portion of a reservation', async () => {
    await reserveProviderCalls(4);
    await refundProviderCalls(4 - 2); // the run really used 2
    expect(dayCount()).toBe(2);
  });

  it('never drives the counter negative', async () => {
    await reserveProviderCalls(1);
    await refundProviderCalls(50);
    expect(dayCount()).toBe(0);
  });

  it('ignores zero and negative refunds', async () => {
    await reserveProviderCalls(4);
    await refundProviderCalls(0);
    await refundProviderCalls(-3);
    expect(dayCount()).toBe(4);
  });

  it('does nothing when there is no window to refund into', async () => {
    await expect(refundProviderCalls(3)).resolves.toBeUndefined();
    expect(dayCount()).toBe(0);
  });

  it('leaves budget intact across a reserve/refund cycle', async () => {
    // 10 runs that each use 1 call should cost 10, not 40.
    for (let i = 0; i < 10; i++) {
      await reserveProviderCalls(4);
      await refundProviderCalls(3);
    }
    expect(dayCount()).toBe(10);
  });
});
