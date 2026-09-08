/**
 * lib/student-context.ts — what the agent knows about the student it is
 * talking to.
 *
 * The difference between a chatbot and an assistant that is actually worth
 * signing in for is whether it knows who you are. This module answers, for
 * the *verified* caller only: are you on the roster, where do you rank, how
 * many PRs have you landed, and what is your score.
 *
 * Everything here comes from the same summary cache the public leaderboard
 * renders from (lib/summary-cache.ts), so the agent can never quote a number
 * the student cannot also see on their own profile page. That is deliberate:
 * it keeps the agent honest and keeps this module free of any new data access.
 *
 * PRIVACY: only ever called with a login resolved by lib/session.ts from
 * GitHub's own /user endpoint. Never trust a login that arrived in a request
 * body — that was the impersonation bug this stack already had once.
 */
import { readSummaryCache } from './summary-cache';
import { sanitizeField } from './assistant';

export interface StudentStanding {
  /** Verified GitHub login, as recorded on the roster. */
  login: string;
  /** 1-based position on the all-time leaderboard, or null if unranked. */
  rank: number | null;
  /** How many students are ranked at all, for "rank 12 of 340" phrasing. */
  rankedOf: number;
  mergedPRs: number;
  openPRs: number;
  totalPRs: number;
  issues: number;
  score: number;
  year?: string;
  campus?: string;
  /** True when the roster knows them but nothing has been scored yet. */
  unscored: boolean;
}

export type StandingResult =
  | { status: 'ranked'; standing: StudentStanding }
  | { status: 'not_tracked'; login: string }
  | { status: 'unavailable' };

/**
 * Students with a zero score are not "rank 1,700 of 1,839" — they are simply
 * not on the board yet, and telling a beginner they are near-last is both
 * inaccurate and discouraging. Only students with a real score are ranked;
 * everyone else gets `rank: null` and `unscored: true`, which the caller
 * renders as an invitation rather than a position.
 */
function rankOf(
  summaries: Array<{ profile?: { login?: string }; scoreMergedPRs?: number }>,
  login: string,
): { rank: number | null; rankedOf: number } {
  const scored = summaries
    .filter((s) => typeof s.scoreMergedPRs === 'number' && s.scoreMergedPRs > 0)
    .sort((a, b) => (b.scoreMergedPRs ?? 0) - (a.scoreMergedPRs ?? 0));
  const idx = scored.findIndex((s) => s.profile?.login?.toLowerCase() === login.toLowerCase());
  return { rank: idx >= 0 ? idx + 1 : null, rankedOf: scored.length };
}

/**
 * Looks up the caller's standing. Returns `unavailable` rather than throwing
 * or inventing zeros when the cache has never been built — a fresh clone has
 * no leaderboard, and the agent must say so instead of reporting that the
 * student has done nothing.
 */
export async function getStanding(login: string): Promise<StandingResult> {
  if (typeof login !== 'string' || !login.trim()) return { status: 'unavailable' };
  const clean = login.trim();

  let cache;
  try {
    cache = await readSummaryCache('all');
  } catch {
    return { status: 'unavailable' };
  }
  if (!cache || !Array.isArray(cache.summaries) || cache.summaries.length === 0) {
    return { status: 'unavailable' };
  }

  const mine = cache.summaries.find(
    (s) => s.profile?.login?.toLowerCase() === clean.toLowerCase(),
  );
  if (!mine) return { status: 'not_tracked', login: sanitizeField(clean, 40) };

  const { rank, rankedOf } = rankOf(cache.summaries, clean);
  const score = typeof mine.scoreMergedPRs === 'number' ? mine.scoreMergedPRs : 0;

  return {
    status: 'ranked',
    standing: {
      login: sanitizeField(mine.profile?.login ?? clean, 40),
      rank,
      rankedOf,
      mergedPRs: mine.mergedPRs ?? 0,
      openPRs: mine.openPRs ?? 0,
      totalPRs: mine.totalPRs ?? 0,
      issues: mine.issuesCount ?? 0,
      score: Math.round(score * 100) / 100,
      year: mine.year ? sanitizeField(mine.year, 20) : undefined,
      campus: mine.campus ? sanitizeField(mine.campus, 30) : undefined,
      unscored: score <= 0,
    },
  };
}

/**
 * One line describing the caller, for the DATA block. Phrased so the model
 * has no room to editorialise a low number into a judgement: an unscored
 * student is "no merged PRs counted yet", never "ranked last".
 */
export function describeStanding(result: StandingResult): string {
  if (result.status === 'unavailable') {
    return 'Leaderboard: standings unavailable right now — do not guess rank or PR counts.';
  }
  if (result.status === 'not_tracked') {
    return `Leaderboard: @${result.login} is not on the roster yet — point to /join to request being added.`;
  }
  const s = result.standing;
  const who = [s.year, s.campus].filter(Boolean).join(', ');
  if (s.unscored) {
    return (
      `Leaderboard: @${s.login} is on the roster${who ? ` (${who})` : ''} with no counted merged PRs yet ` +
      `(${s.openPRs} open, ${s.totalPRs} total, ${s.issues} issues). They are not ranked — this is a normal ` +
      'starting point, not a bad position. Their next merged PR into someone else’s repo puts them on the board.'
    );
  }
  return (
    `Leaderboard: @${s.login}${who ? ` (${who})` : ''} is ranked ${s.rank} of ${s.rankedOf} scored students, ` +
    `score ${s.score}, ${s.mergedPRs} merged PRs counted, ${s.openPRs} open, ${s.issues} issues. ` +
    `Profile /contributors/${s.login}, work checker /check-work/${s.login}.`
  );
}
