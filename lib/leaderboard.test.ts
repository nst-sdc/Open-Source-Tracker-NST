import { describe, it, expect } from 'vitest';
import { matchesFilters, pageOf, parseLeaderboardQuery, toRow, hasActivity } from './leaderboard';
import type { StudentSummary } from './github';

const sum = (over: Partial<StudentSummary> & { login: string }): StudentSummary =>
  ({
    profile: { login: over.login, name: `Name ${over.login}`, avatar_url: `https://avatars.githubusercontent.com/u/1?v=4`, html_url: '', bio: null, public_repos: 0, followers: 0, following: 0, company: null, location: null, blog: null, twitter_username: null, created_at: '' },
    organizations: [],
    totalPRs: 0,
    mergedPRs: 0,
    openPRs: 0,
    closedPRs: 0,
    scoreMergedPRs: 0,
    issuesCount: 0,
    ...over,
  }) as StudentSummary;

describe('parseLeaderboardQuery', () => {
  it('defaults and takes the first of repeated params', () => {
    expect(parseLeaderboardQuery({})).toEqual({ period: 'all', from: undefined, to: undefined, search: '', org: '', year: '', campus: '' });
    expect(parseLeaderboardQuery({ period: 'week', campus: ['ADYPU', 'SVYASA'], from: '' })).toMatchObject({ period: 'week', campus: 'ADYPU', from: undefined });
  });
});

describe('toRow', () => {
  it('keeps only what a row renders', () => {
    const row = toRow(sum({ login: 'alice', mergedPRs: 3, openPRs: 1, totalPRs: 5, issuesCount: 2, scoreMergedPRs: 12.5, avgScore: 1.2, year: '2nd year', campus: 'ADYPU' }), 7);
    expect(row).toEqual({ login: 'alice', name: 'Name alice', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4', rank: 7, mergedPRs: 3, openPRs: 1, totalPRs: 5, issuesCount: 2, scoreMergedPRs: 12.5, avgScore: 1.2, year: '2nd year', campus: 'ADYPU' });
    expect(Object.keys(toRow(sum({ login: 'bob' }), 0))).not.toContain('avgScore');
  });
});

describe('matchesFilters and hasActivity', () => {
  it('matches text against login, name, year and campus, and exact year/campus filters', () => {
    const s = sum({ login: 'alice-dev', year: '2nd year', campus: 'ADYPU' });
    expect(matchesFilters(s, { search: 'ALICE', year: '', campus: '' })).toBe(true);
    expect(matchesFilters(s, { search: 'adypu', year: '', campus: '' })).toBe(true);
    expect(matchesFilters(s, { search: '', year: '3rd year', campus: '' })).toBe(false);
    expect(matchesFilters(s, { search: '', year: '2nd year', campus: 'ADYPU' })).toBe(true);
    expect(hasActivity(sum({ login: 'x', issuesCount: 1 }))).toBe(true);
    expect(hasActivity(sum({ login: 'y' }))).toBe(false);
  });
});

describe('pageOf', () => {
  const rows = Array.from({ length: 120 }, (_, i) => i);
  it('slices with a next offset until the end', () => {
    expect(pageOf(rows, 0, 50)).toMatchObject({ total: 120, nextOffset: 50 });
    expect(pageOf(rows, 100, 50)).toMatchObject({ rows: rows.slice(100), nextOffset: null });
    expect(pageOf(rows, 500, 50)).toMatchObject({ rows: [], nextOffset: null });
  });
  it('caps the page size and ignores nonsense offsets', () => {
    expect(pageOf(rows, -5, 1000).rows).toHaveLength(100);
    expect(pageOf(rows, 0, 0).rows).toHaveLength(1);
  });
});
