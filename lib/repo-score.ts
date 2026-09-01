/**
 * Repo quality scoring — the math behind the leaderboard, issue #4.
 *
 * Everything in this file is a pure function: no I/O, no clock, no globals.
 * lib/github.ts fetches the signals and calls in here; the unit tests feed in
 * the fixture repos from the issue and assert the expected ordering.
 *
 * All constants are deliberately public and documented (decided in #4): a
 * contributor should be able to read this file and understand exactly why one
 * PR scored higher than another, and what kind of project is worth their time.
 *
 * The pipeline, per repo:
 *
 *   C  = criticality(signals)      how substantial is this project?   [0..1]
 *   G  = penalties(signals)        does anything smell like a farm?   [0..1]
 *   M  = 0.15 + 2.85·(C·G)         the repo multiplier                [0.15..3]
 *
 * and per PR:
 *
 *   PRScore = 10 · M^0.75 / (1 + 0.3·(k−1))
 *
 * where k is which PR this is into that same repo (1st, 2nd, ...). The old
 * formula's floor of 1 is gone on purpose — junk repos now bottom out at
 * M = 0.15, so farming them is actually cheap, not merely slightly-less-good.
 */

/** Bump when RepoCacheEntry gains fields the scorer depends on. Entries with a
 *  different (or missing) version are re-fetched by validateNewRepos; until
 *  then they score through legacyMultiplier() below. */
export const REPO_SCHEMA_VERSION = 2;

/** Everything the scorer wants to know about one repository. Fetched in a
 *  single GraphQL call per repo (see validateNewRepos). */
export interface RepoSignals {
  stars: number;
  forks: number;
  /** People subscribed to notifications ("watching"), not stargazers. A much
   *  rarer, more deliberate act than a star. */
  watchers: number;
  releases: number;
  /** GraphQL has no exact contributor count; mentionableUsers is the closest
   *  single-query proxy (roughly contributors + collaborators). */
  contributors: number;
  commitsLastYear: number;
  /** Lifetime merged PRs across the whole repo — not the student's. */
  mergedPRCount: number;
  closedIssueCount: number;
  languageCount: number;
  topics: string[];
  licenseSpdxId: string | null;
  isFork: boolean;
  isArchived: boolean;
  ownerLogin: string;
  createdAt: string;
  pushedAt: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stage 1 — base quality C (OpenSSF Criticality Score shape)
 *
 * Each raw signal is log-squashed so no single number can run away, capped at
 * the point where more stops meaning anything, then combined as a weighted
 * average. Note stars carry weight 1 out of ~12 total (~8%): they are the
 * easiest signal to fake, so they get the least say.
 * ──────────────────────────────────────────────────────────────────────────── */

export const CRITICALITY_WEIGHTS: ReadonlyArray<{
  key: string;
  weight: number;
  cap: number;
  value: (s: RepoSignals, nowMs: number) => number;
}> = [
  { key: 'contributors', weight: 3.0, cap: 1000, value: (s) => s.contributors },
  { key: 'commitsLastYear', weight: 1.5, cap: 1000, value: (s) => s.commitsLastYear },
  { key: 'mergedPRs', weight: 1.5, cap: 5000, value: (s) => s.mergedPRCount },
  { key: 'closedIssues', weight: 1.5, cap: 5000, value: (s) => s.closedIssueCount },
  { key: 'releases', weight: 1.0, cap: 50, value: (s) => s.releases },
  { key: 'stars', weight: 1.0, cap: 50000, value: (s) => s.stars },
  { key: 'forks', weight: 0.5, cap: 10000, value: (s) => s.forks },
  {
    key: 'ageMonths',
    weight: 1.0,
    cap: 120,
    value: (s, now) => monthsBetween(s.createdAt, now),
  },
  {
    // Rewards being pushed to recently; a repo untouched for a year scores 0
    // here. This is the only signal where *small* elapsed time is good.
    key: 'recency',
    weight: 1.5,
    cap: 12,
    value: (s, now) => Math.max(0, 12 - monthsBetween(s.pushedAt, now)),
  },
];

function monthsBetween(iso: string, nowMs: number): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, (nowMs - then) / (1000 * 60 * 60 * 24 * 30.44));
}

/** C in [0, 1]. `nowMs` is a parameter (not Date.now()) to keep this pure. */
export function criticalityScore(s: RepoSignals, nowMs: number): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const { weight, cap, value } of CRITICALITY_WEIGHTS) {
    const raw = Math.max(0, value(s, nowMs));
    weighted += (weight * Math.log(1 + Math.min(raw, cap))) / Math.log(1 + cap);
    totalWeight += weight;
  }
  return weighted / totalWeight;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stage 2 — penalty gate G
 *
 * Each penalty is a factor in (0, 1]; they multiply. g_audience does most of
 * the work: it asks whether anyone actually *uses* the project relative to
 * how many people are pushing code into it. Farm repos are busy but have no
 * audience — hundreds of merged PRs, single-digit stars, zero watchers.
 * ──────────────────────────────────────────────────────────────────────────── */

export const PENALTIES = {
  audienceDivisor: 2, // g_audience = clamp(audience / this, floor, 1)
  audienceFloor: 0.1,
  noReleases: 0.5,
  noCode: 0.35, // zero languages — catches awesome-lists and link dumps
  isFork: 0.5,
  selfOwned: 0.1, // PRs into your own repo are not open source contribution
  farmTopics: 0.45,
  badLicense: 0.7, // none, or CC-* (content licenses, not software)
} as const;

/** Topics that mark content collections rather than software projects.
 *  Matched as substrings: GitHub's conventions are compounds like
 *  "awesome-list", "interview-preparation", "roadmaps". */
export const FARM_TOPIC_MARKERS = ['awesome', 'roadmap', 'tutorial', 'interview'];

/** audience = (stars + 5·watchers) / (forks + 0.2·mergedPRs).
 *  gofr ≈ 9.8, hyperfine ≈ 49; the farm repos in #4 sit at 0.01–0.07. */
export function audienceRatio(s: RepoSignals): number {
  const demand = s.stars + 5 * s.watchers;
  const supply = s.forks + 0.2 * s.mergedPRCount;
  if (supply <= 0) return demand > 0 ? Infinity : 0;
  return demand / supply;
}

export function penaltyGate(s: RepoSignals, opts: { selfOwned: boolean }): number {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  let g = clamp(audienceRatio(s) / PENALTIES.audienceDivisor, PENALTIES.audienceFloor, 1);
  if (s.releases === 0) g *= PENALTIES.noReleases;
  if (s.languageCount === 0) g *= PENALTIES.noCode;
  if (s.isFork) g *= PENALTIES.isFork;
  if (opts.selfOwned) g *= PENALTIES.selfOwned;
  if (s.topics.some((t) => FARM_TOPIC_MARKERS.some((m) => t.toLowerCase().includes(m)))) {
    g *= PENALTIES.farmTopics;
  }
  const lic = s.licenseSpdxId;
  if (!lic || lic.toUpperCase().startsWith('CC-') || lic.toUpperCase() === 'CC0-1.0') {
    g *= PENALTIES.badLicense;
  }
  return g;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stage 3 — the multiplier M and per-PR score
 * ──────────────────────────────────────────────────────────────────────────── */

export const MULTIPLIER_MIN = 0.15;
export const MULTIPLIER_MAX = 3.0;

/** Orgs whose repos never score below this, so a three-month-old CNCF sandbox
 *  project isn't punished for being new. A floor only — established repos in
 *  these orgs earn their (higher) score the normal way. */
export const CURATED_ORG_FLOOR = 1.5;
export const CURATED_ORGS = new Set([
  'apache',
  'kubernetes',
  'cncf',
  'nodejs',
  'python',
  'rust-lang',
  'golang',
  'jenkinsci',
  'mozilla',
  'torvalds',
]);

export function repoMultiplier(
  s: RepoSignals,
  nowMs: number,
  opts: { selfOwned: boolean }
): number {
  const c = criticalityScore(s, nowMs);
  const g = penaltyGate(s, opts);
  let m = MULTIPLIER_MIN + (MULTIPLIER_MAX - MULTIPLIER_MIN) * (c * g);
  if (!opts.selfOwned && CURATED_ORGS.has(s.ownerLogin.toLowerCase())) {
    m = Math.max(m, CURATED_ORG_FLOOR);
  }
  return Math.min(MULTIPLIER_MAX, Math.max(MULTIPLIER_MIN, m));
}

/** Fallback multiplier for repos whose cache entry predates REPO_SCHEMA_VERSION
 *  (only {stars, forks, valid} known). Stars-only on purpose: the old formula's
 *  fork-trust is exactly what #4 removes. These entries are re-fetched by the
 *  next refresh cycle; this just keeps scores sane in the window between
 *  deploy and refetch instead of silently collapsing everything to a constant. */
export function legacyMultiplier(stars: number): number {
  const c = Math.min(1, Math.log10(Math.max(0, stars) + 1) / 5); // 100k stars → 1
  return Math.min(
    MULTIPLIER_MAX,
    Math.max(MULTIPLIER_MIN, MULTIPLIER_MIN + (MULTIPLIER_MAX - MULTIPLIER_MIN) * c)
  );
}

/** Multiplier for a repo we know nothing about at all (no cache entry yet). */
export const NEUTRAL_MULTIPLIER = 1.0;

export const PR_BASE_POINTS = 10;
/** Prestige dampener: a big-name repo helps, but doesn't decide on its own. */
export const PRESTIGE_EXPONENT = 0.75;
/** Per-repo diminishing returns (decided in #4 discussion: 0.3, not 0.35).
 *  2nd PR into the same repo is worth 77% of the 1st, the 3rd 63%, ... */
export const PER_REPO_DECAY = 0.3;

/** Score of the k-th merged PR (k = 1, 2, ...) into a repo with multiplier m.
 *  The effort term E from #4 is not implemented yet and reads as 1. */
export function prScore(m: number, k: number): number {
  return (PR_BASE_POINTS * Math.pow(m, PRESTIGE_EXPONENT)) / (1 + PER_REPO_DECAY * (k - 1));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Aggregation — a student's total, with the concentration cap
 * ──────────────────────────────────────────────────────────────────────────── */

/** Ceiling on any one repo's contribution, as a share of the uncapped total.
 *  See aggregateMergedPRScore for why it's defined against the uncapped sum. */
export const MAX_SHARE_PER_REPO = 0.4;

/**
 * Total score for a list of merged PRs. `repoOf` maps each PR to its repo
 * full name (or null when unknown → neutral weight), `multiplierFor` maps a
 * repo name to its M.
 *
 * Per repo, PRs earn prScore(m, 1), prScore(m, 2), ... — the order of PRs
 * within a repo doesn't matter because the decayed values are summed anyway.
 * Then every repo's subtotal is capped at MAX_SHARE_PER_REPO of the uncapped
 * total. This formulation (rather than "40% of the final total") is chosen
 * because it is monotone — merging another PR can never lower anyone's score —
 * and continuous as a profile goes from one repo to several. Consequences:
 * a profile spread over 3+ repos is typically untouched; everything in one
 * repo scores 0.4×; an even two-repo split scores 0.8×. Deep work on a single
 * project is already tempered by the decay — this cap is the cross-repo
 * balance on top of it.
 */
export function aggregateMergedPRScore<T>(
  mergedPRs: T[],
  repoOf: (pr: T) => string | null,
  multiplierFor: (repoFullName: string) => number
): number {
  const countByRepo = new Map<string | null, number>();
  for (const pr of mergedPRs) {
    const repo = repoOf(pr);
    countByRepo.set(repo, (countByRepo.get(repo) ?? 0) + 1);
  }

  const subtotals: number[] = [];
  for (const [repo, count] of countByRepo) {
    const m = repo === null ? NEUTRAL_MULTIPLIER : multiplierFor(repo);
    let subtotal = 0;
    for (let k = 1; k <= count; k++) subtotal += prScore(m, k);
    subtotals.push(subtotal);
  }

  const total = subtotals.reduce((a, b) => a + b, 0);
  const ceiling = MAX_SHARE_PER_REPO * total;
  return subtotals.reduce((sum, sub) => sum + Math.min(sub, ceiling), 0);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Validity — replaces the old `stars >= 5` gate
 * ──────────────────────────────────────────────────────────────────────────── */

export const VALIDITY_MIN_AUDIENCE = 0.15;

/** A repo's PRs are excluded from the tracker entirely when this is false.
 *  Archived repos and forks are out; so is anything with effectively no
 *  audience AND no releases — the signature of a pure farm target. This is a
 *  coarse gate; the multiplier does the fine-grained pricing above it. */
export function isRepoValid(s: RepoSignals): boolean {
  if (s.isArchived || s.isFork) return false;
  if (audienceRatio(s) < VALIDITY_MIN_AUDIENCE && s.releases === 0) return false;
  return true;
}
