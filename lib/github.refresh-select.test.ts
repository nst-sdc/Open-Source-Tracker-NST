import { describe, it, expect, vi } from 'vitest';

vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvRead: vi.fn(async () => ({ ok: true, value: null })), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => {}) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));

const { classifyRefreshCandidates } = await import('./github');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-21T12:00:00Z');
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

describe('classifyRefreshCandidates', () => {
  it('puts never-attempted logins first and leaves fresh caches alone', () => {
    const out = classifyRefreshCandidates({
      students: [{ github: 'New1' }, { github: 'Fresh' }, { github: 'Old' }],
      cacheMap: new Map([['fresh', iso(DAY / 2)], ['old', iso(DAY * 2)]]),
      failState: {},
      excluded: new Set(),
      now,
      staleMs: DAY,
    });
    expect(out.neverCached).toEqual(['New1']);
    expect(out.staleCached.map((s) => s.username)).toEqual(['Old']);
  });

  it('skips a login that failed or was not found recently, and rotates it in after a cycle', () => {
    const out = classifyRefreshCandidates({
      students: [
        { github: 'FailedJustNow' },
        { github: 'FailedYesterday' },
        { github: 'Deleted', unresolvedSince: iso(DAY / 4) },
        { github: 'DeletedLongAgo', unresolvedSince: iso(DAY * 3) },
      ],
      cacheMap: new Map(),
      failState: { failedjustnow: iso(60_000), failedyesterday: iso(DAY + 1) },
      excluded: new Set(),
      now,
      staleMs: DAY,
    });
    expect(out.neverCached).toEqual([]); // nobody leads the tick on a known failure
    expect(out.staleCached.map((s) => s.username).sort()).toEqual(['DeletedLongAgo', 'FailedYesterday']);
  });

  it('honours the excluded set', () => {
    const out = classifyRefreshCandidates({ students: [{ github: 'Queued' }], cacheMap: new Map(), failState: {}, excluded: new Set(['queued']), now, staleMs: DAY });
    expect(out.neverCached).toEqual([]);
  });
});
