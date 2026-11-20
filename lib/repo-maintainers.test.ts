import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveMaintainers, isBotAccount, fetchRecentMergers, fetchMergeEvents } from './repo-maintainers';

describe('deriveMaintainers', () => {
  it('unions every signal, lowercased, and always includes the owner', () => {
    const m = deriveMaintainers({
      owner: 'Jenkins-Infra',
      collaborators: ['Alice'],
      publicMembers: ['Bob'],
      mergers: ['MarkEWaite', ''],
      associations: [
        { login: 'carol', association: 'MEMBER' },
        { login: 'dave', association: 'CONTRIBUTOR' },
        { login: 'erin', association: null },
      ],
    });
    expect([...m].sort()).toEqual(['alice', 'bob', 'carol', 'jenkins-infra', 'markewaite']);
  });
});

describe('isBotAccount', () => {
  it('recognises GitHub bots by type, [bot] suffix and known logins', () => {
    expect(isBotAccount({ login: 'github-actions[bot]', type: 'Bot' })).toBe(true);
    expect(isBotAccount({ login: 'jenkins-infra-changelog-generator[bot]' })).toBe(true);
    expect(isBotAccount({ login: 'dependabot' })).toBe(true);
    expect(isBotAccount({ login: 'robot-lover', type: 'User' })).toBe(false);
    expect(isBotAccount(null)).toBe(false);
  });
});

describe('fetchRecentMergers', () => {
  it('returns null without a token, so the caller knows the signal is absent', async () => {
    expect(await fetchRecentMergers('o', 'r', { Accept: 'x' })).toBeNull();
  });
});

describe('fetchMergeEvents', () => {
  afterEach(() => vi.unstubAllGlobals());
  const node = (number: number, mergedAt: string, by: string | null, updatedAt = mergedAt) => ({ number, title: `pr ${number}`, mergedAt, updatedAt, mergedBy: by ? { login: by } : null, author: { login: 'someone' } });
  const page = (nodes: unknown[], hasNextPage: boolean, endCursor = 'c') =>
    new Response(JSON.stringify({ data: { repository: { pullRequests: { pageInfo: { hasNextPage, endCursor }, nodes } } } }), { status: 200 });

  it('returns null without a token', async () => {
    expect(await fetchMergeEvents('o', 'r', { Accept: 'x' })).toBeNull();
  });

  it('reads minPages regardless of the window, then stops once a page ends before `since`', async () => {
    const pages = [
      page([node(9, '2026-11-18T10:00:00Z', 'maya')], true),
      page([node(8, '2026-11-01T10:00:00Z', 'maya'), node(7, '2026-10-20T10:00:00Z', null)], true), // ends before since
      page([node(6, '2026-09-01T10:00:00Z', 'raj')], true),
      page([node(5, '2026-08-01T10:00:00Z', 'raj')], true),
    ];
    const fetchMock = vi.fn(async () => pages.shift()!);
    vi.stubGlobal('fetch', fetchMock);
    const events = await fetchMergeEvents('o', 'r', { Authorization: 'Bearer t' }, { since: new Date('2026-11-10T00:00:00Z'), minPages: 3, maxPages: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // page 2 already ended before since, but minPages is 3
    expect(events!.map((e) => e.number)).toEqual([9, 8, 6]); // no mergedBy → not an event
    expect(events![0]).toMatchObject({ mergedBy: 'maya', author: 'someone', title: 'pr 9' });
  });

  it('keeps reading up to maxPages while pages still reach the window', async () => {
    const pages = [
      page([node(4, '2026-11-18T10:00:00Z', 'maya')], true),
      page([node(3, '2026-11-17T10:00:00Z', 'maya')], true),
      page([node(2, '2026-11-16T10:00:00Z', 'maya')], true),
      page([node(1, '2026-11-15T10:00:00Z', 'maya')], false),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => pages.shift()!));
    const events = await fetchMergeEvents('o', 'r', { Authorization: 'Bearer t' }, { since: new Date('2026-11-01T00:00:00Z'), minPages: 1, maxPages: 10 });
    expect(events).toHaveLength(4); // stopped by hasNextPage=false
  });

  it('derives the merger set for deriveMaintainers from the same call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => page([node(1, '2026-11-18T10:00:00Z', 'Maya'), node(2, '2026-11-18T09:00:00Z', 'raj')], false)));
    expect(await fetchRecentMergers('o', 'r', { Authorization: 'Bearer t' })).toEqual(new Set(['maya', 'raj']));
  });
});
