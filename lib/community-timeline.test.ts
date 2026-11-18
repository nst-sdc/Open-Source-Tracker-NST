import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => true) }));
vi.mock('./profile-cache', () => ({ readProfileCache: vi.fn(async () => null) }));
import { foldStudent, lastMonths, seriesFor, segmentKey, buildCommunityTimeline, timelineIsStale, type CommunityTimeline } from './community-timeline';

const NOW = Date.UTC(2026, 10, 18); // 2026-11-18
const pr = (repo: string, n: number, created: string, merged?: string) =>
  ({ number: n, repository_url: `https://api.github.com/repos/${repo}`, created_at: created, state: merged ? 'closed' : 'open', pull_request: { merged_at: merged ?? null } }) as never;

describe('lastMonths', () => {
  it('ends at the current month and crosses a year boundary', () => {
    expect(lastMonths(3, NOW)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(lastMonths(14, NOW)[0]).toBe('2025-10');
  });
});

describe('foldStudent', () => {
  it('counts opened by creation month, merged by merge month, contributors once per month, and applies exclusions', () => {
    const months: CommunityTimeline['months'] = {};
    const keep = new Set(lastMonths(12, NOW));
    const alice = { github: 'alice', campus: 'ADYPU' as const, year: '2nd year' as const };
    foldStudent(
      months,
      alice,
      {
        prs: [
          pr('apache/kafka', 1, '2026-09-10T00:00:00Z', '2026-10-02T00:00:00Z'),
          pr('apache/kafka', 2, '2026-10-05T00:00:00Z', '2026-10-20T00:00:00Z'),
          pr('tiny/repo', 3, '2026-10-06T00:00:00Z', '2026-10-07T00:00:00Z'),
          pr('apache/spark', 4, '2026-10-08T00:00:00Z'),
          pr('old/one', 5, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z'),
        ],
        issues: [{ created_at: '2026-10-01T00:00:00Z' } as never],
      },
      { flaggedPRIds: new Set(['apache/spark#4']), excludesPR: (repo) => repo === 'tiny/repo' },
      keep,
    );
    const seg = segmentKey(alice);
    expect(months['2026-09'][seg]).toEqual({ opened: 1, merged: 0, issues: 0, contributors: 0 });
    expect(months['2026-10'][seg]).toEqual({ opened: 1, merged: 2, issues: 1, contributors: 1 });
    expect(months['2024-01']).toBeUndefined();
  });
});

describe('seriesFor', () => {
  it('zero-fills, sums matching segments only, and marks the running month partial', () => {
    const t: CommunityTimeline = {
      builtAt: new Date(NOW).toISOString(),
      studentsCounted: 3,
      months: {
        '2026-10': { 'ADYPU|2nd year': { opened: 3, merged: 2, issues: 1, contributors: 2 }, 'Rishihood|3rd year': { opened: 5, merged: 4, issues: 0, contributors: 3 } },
        '2026-11': { 'ADYPU|2nd year': { opened: 1, merged: 1, issues: 0, contributors: 1 } },
      },
    };
    const all = seriesFor(t, {}, 3, NOW);
    expect(all.map((b) => [b.month, b.merged, b.contributors, b.partial])).toEqual([
      ['2026-09', 0, 0, false],
      ['2026-10', 6, 5, false],
      ['2026-11', 1, 1, true],
    ]);
    expect(seriesFor(t, { campus: 'ADYPU' }, 2, NOW).map((b) => b.merged)).toEqual([2, 1]);
    expect(seriesFor(t, { campus: 'ADYPU', year: '3rd year' }, 2, NOW).map((b) => b.merged)).toEqual([0, 0]);
    expect(seriesFor(null, {}, 2, NOW).every((b) => b.opened === 0)).toBe(true);
  });
});

describe('buildCommunityTimeline and staleness', () => {
  it('reads every profile (retrying once) and stamps the build', async () => {
    let flaky = 0;
    const t = await buildCommunityTimeline(
      [{ github: 'a', campus: 'ADYPU', year: '2nd year' }, { github: 'b' }, { github: 'c' }],
      () => ({}),
      async (login) => {
        if (login === 'b' && flaky++ === 0) throw new Error('burst');
        if (login === 'c') return null;
        return { prs: [pr('x/y', 1, '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')], issues: [] };
      },
      NOW,
    );
    expect(t.studentsCounted).toBe(2);
    expect(seriesFor(t, {}, 1, NOW)[0]).toMatchObject({ merged: 2, contributors: 2 });
    expect(timelineIsStale(t, NOW)).toBe(false);
    expect(timelineIsStale(t, NOW + 7 * 60 * 60 * 1000)).toBe(true);
    expect(timelineIsStale(null)).toBe(true);
  });
});
