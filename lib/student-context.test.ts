/**
 * Standing tests.
 *
 * The behaviour that matters is what happens to a beginner. A student with no
 * merged PRs must never be told they are "rank 1,700 of 1,839" — that is both
 * wrong (they are unranked, not last) and the single most discouraging thing
 * this feature could say to the exact person it exists to help.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let cache: unknown = null;

vi.mock('@/lib/summary-cache', () => ({
  readSummaryCache: async () => cache,
}));

import { describeStanding, getStanding } from './student-context';

function student(login: string, score: number, merged = 0) {
  return {
    profile: { login },
    scoreMergedPRs: score,
    mergedPRs: merged,
    openPRs: 0,
    totalPRs: merged,
    issuesCount: 0,
  };
}

beforeEach(() => {
  cache = null;
});

describe('getStanding', () => {
  it('reports unavailable when the leaderboard has never been built', async () => {
    cache = null;
    expect((await getStanding('someone')).status).toBe('unavailable');
  });

  it('reports unavailable rather than inventing zeros for an empty cache', async () => {
    cache = { cachedAt: '', summaries: [] };
    expect((await getStanding('someone')).status).toBe('unavailable');
  });

  it('reports not_tracked for someone off the roster', async () => {
    cache = { cachedAt: '', summaries: [student('alice', 10, 2)] };
    const r = await getStanding('bob');
    expect(r.status).toBe('not_tracked');
  });

  it('ranks by score, highest first', async () => {
    cache = {
      cachedAt: '',
      summaries: [student('c', 5, 1), student('a', 30, 6), student('b', 12, 3)],
    };
    const r = await getStanding('b');
    expect(r.status).toBe('ranked');
    if (r.status === 'ranked') {
      expect(r.standing.rank).toBe(2);
      expect(r.standing.rankedOf).toBe(3);
    }
  });

  it('is case-insensitive about the login', async () => {
    cache = { cachedAt: '', summaries: [student('Alice', 10, 2)] };
    const r = await getStanding('alice');
    expect(r.status).toBe('ranked');
  });

  it('leaves an unscored student unranked instead of last', async () => {
    cache = {
      cachedAt: '',
      summaries: [student('top', 50, 9), student('newbie', 0, 0), student('mid', 5, 1)],
    };
    const r = await getStanding('newbie');
    expect(r.status).toBe('ranked');
    if (r.status === 'ranked') {
      expect(r.standing.rank).toBeNull();
      expect(r.standing.unscored).toBe(true);
      // Only the two scored students count toward the denominator.
      expect(r.standing.rankedOf).toBe(2);
    }
  });

  it('rounds the score rather than exposing float noise', async () => {
    cache = { cachedAt: '', summaries: [student('a', 12.3456789, 3)] };
    const r = await getStanding('a');
    if (r.status === 'ranked') expect(r.standing.score).toBe(12.35);
  });

  it('rejects an empty login without touching the cache', async () => {
    expect((await getStanding('   ')).status).toBe('unavailable');
  });
});

describe('describeStanding', () => {
  it('never tells an unscored student they are ranked last', async () => {
    cache = { cachedAt: '', summaries: [student('top', 50, 9), student('newbie', 0, 0)] };
    const text = describeStanding(await getStanding('newbie'));
    expect(text).toContain('no counted merged PRs yet');
    expect(text).toContain('not a bad position');
    expect(text).not.toMatch(/ranked \d/);
  });

  it('states the rank for a scored student', async () => {
    cache = { cachedAt: '', summaries: [student('a', 30, 6), student('b', 12, 3)] };
    const text = describeStanding(await getStanding('b'));
    expect(text).toContain('ranked 2 of 2');
    expect(text).toContain('3 merged PRs');
  });

  it('tells the model not to guess when standings are unavailable', async () => {
    const text = describeStanding({ status: 'unavailable' });
    expect(text).toMatch(/do not guess/i);
  });

  it('points an untracked student at /join', () => {
    expect(describeStanding({ status: 'not_tracked', login: 'bob' })).toContain('/join');
  });
});
