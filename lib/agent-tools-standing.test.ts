/**
 * get_my_standing, which reads the same summary cache the public leaderboard
 * renders from. Separate from lib/agent-tools.test.ts because the only way
 * to test it is to mock that cache, and `vi.mock` is file-wide.
 *
 * The behaviour under test is mostly about what the tool must NOT say: never
 * a guessed rank when the cache is cold, and never "you are not on the
 * leaderboard" to a student who joined an hour ago and has simply not been
 * scored yet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StandingResult } from './student-context';
import type { Student } from './github';

const getStanding = vi.hoisted(() => vi.fn());
const getStudentsKV = vi.hoisted(() => vi.fn());

vi.mock('./student-context', () => ({ getStanding }));
vi.mock('./kv-students', () => ({ getStudentsKV }));

const { getTool } = await import('./agent-tools');

const ME = { username: 'octocat', token: null, requestId: 't' };

async function standing(ctx: typeof ME | { username: string | null; token: null; requestId: string } = ME) {
  return getTool('get_my_standing')!.run({}, ctx);
}

function ranked(over: Partial<StandingResult & { standing: unknown }> = {}): StandingResult {
  return {
    status: 'ranked',
    standing: {
      login: 'octocat',
      rank: 12,
      rankedOf: 340,
      mergedPRs: 9,
      openPRs: 2,
      totalPRs: 14,
      issues: 3,
      score: 41.5,
      year: '2nd year',
      campus: 'Rishihood',
      unscored: false,
      ...(over as { standing?: Record<string, unknown> }).standing,
    },
  } as StandingResult;
}

beforeEach(() => {
  getStanding.mockReset();
  getStudentsKV.mockReset();
  getStudentsKV.mockResolvedValue([] as Student[]);
});

describe('get_my_standing', () => {
  it('refuses guests before touching the cache', async () => {
    const res = await standing({ username: null, token: null, requestId: 't' });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/sign in/i);
    expect(getStanding).not.toHaveBeenCalled();
  });

  it('refuses a blank or malformed login', async () => {
    expect((await standing({ username: '   ', token: null, requestId: 't' })).ok).toBe(false);
    expect((await standing({ username: 'not a login', token: null, requestId: 't' })).ok).toBe(false);
    expect(getStanding).not.toHaveBeenCalled();
  });

  it('reports rank, score and counts — the numbers it used to leave out', async () => {
    // It previously answered only "you are tracked, here are your links",
    // which was strictly less than the DATA block already carried: any call
    // to it was a wasted turn.
    getStanding.mockResolvedValue(ranked());
    const res = await standing();
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('ranked 12 of 340');
    expect(res.summary).toContain('score 41.5');
    expect(res.summary).toContain('9 merged PRs');
    expect(res.summary).toContain('2 open');
    expect(res.summary).toContain('3 issues');
    expect(res.summary).toContain('2nd year, Rishihood');
    expect(res.summary).toContain('/contributors/octocat');
  });

  it('never calls an unscored student last', async () => {
    getStanding.mockResolvedValue(
      ranked({ standing: { rank: null, rankedOf: 340, mergedPRs: 0, score: 0, unscored: true } } as never),
    );
    const res = await standing();
    expect(res.ok).toBe(true);
    expect(res.summary).toMatch(/normal starting point/);
    expect(res.summary).not.toMatch(/ranked \d/);
  });

  it('says "not scored yet", not "not on the leaderboard", to a new joiner', async () => {
    // The summary cache is rebuilt by scored refreshes, so someone who signed
    // up an hour ago is on the roster and not yet in it. Telling them they
    // are not on the leaderboard is the one badly wrong answer here.
    getStanding.mockResolvedValue({ status: 'not_tracked', login: 'octocat' });
    getStudentsKV.mockResolvedValue([{ github: 'OctoCat' }] as Student[]);
    const res = await standing();
    expect(res.ok).toBe(true);
    expect(res.summary).toMatch(/has not been scored yet/);
    expect(res.summary).not.toMatch(/\/join/);
  });

  it('points a genuinely untracked student at /join', async () => {
    getStanding.mockResolvedValue({ status: 'not_tracked', login: 'stranger' });
    getStudentsKV.mockResolvedValue([{ github: 'someone-else' }] as Student[]);
    const res = await standing();
    expect(res.ok).toBe(true);
    expect(res.summary).toMatch(/\/join/);
  });

  it('admits a cold cache instead of reporting zeros', async () => {
    getStanding.mockResolvedValue({ status: 'unavailable' });
    const res = await standing();
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/unavailable/i);
    expect(res.summary).not.toMatch(/\b0 merged\b/);
  });

  it('turns a thrown cache read into words', async () => {
    getStanding.mockRejectedValue(new Error('kv down'));
    const res = await standing();
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/try again later/i);
  });
});
