/**
 * Fixtures come from issue #4: real numbers pulled from the GitHub API on
 * 2026-08-27 for three known farm targets and three real projects. Fields the
 * issue didn't tabulate (contributors, commits, issues, dates) are realistic
 * estimates — they're test inputs, not live data, and the assertions are about
 * ordering and separation, not exact decimals.
 */
import { describe, it, expect } from 'vitest';
import {
  RepoSignals,
  audienceRatio,
  criticalityScore,
  repoMultiplier,
  legacyMultiplier,
  prScore,
  aggregateMergedPRScore,
  isRepoValid,
  MULTIPLIER_MIN,
  MULTIPLIER_MAX,
  CURATED_ORG_FLOOR,
  PER_REPO_DECAY,
} from './repo-score';

/** Fixed "now" so tests don't drift as the fixtures age. */
const NOW = new Date('2026-08-27T00:00:00Z').getTime();

function repo(partial: Partial<RepoSignals>): RepoSignals {
  return {
    stars: 0,
    forks: 0,
    watchers: 0,
    releases: 0,
    contributors: 0,
    commitsLastYear: 0,
    mergedPRCount: 0,
    closedIssueCount: 0,
    languageCount: 1,
    topics: [],
    licenseSpdxId: 'MIT',
    isFork: false,
    isArchived: false,
    ownerLogin: 'someone',
    createdAt: '2020-01-01T00:00:00Z',
    pushedAt: '2026-08-01T00:00:00Z',
    ...partial,
  };
}

// ── The issue's fixture repos ────────────────────────────────────────────────

const ecoBuddy = repo({
  ownerLogin: 'neeru24',
  stars: 2, forks: 60, watchers: 0, releases: 0,
  mergedPRCount: 590, closedIssueCount: 400,
  contributors: 120, commitsLastYear: 700, languageCount: 3,
  createdAt: '2026-03-01T00:00:00Z', pushedAt: '2026-08-25T00:00:00Z',
});

const campusConnect = repo({
  ownerLogin: 'krushit1307',
  stars: 21, forks: 147, watchers: 0, releases: 0,
  mergedPRCount: 2195, closedIssueCount: 1500,
  contributors: 250, commitsLastYear: 2400, languageCount: 4,
  createdAt: '2026-02-01T00:00:00Z', pushedAt: '2026-08-26T00:00:00Z',
});

const paySphere = repo({
  ownerLogin: 'Dev1822',
  stars: 10, forks: 47, watchers: 1, releases: 0,
  mergedPRCount: 775, closedIssueCount: 500,
  contributors: 90, commitsLastYear: 900, languageCount: 2,
  createdAt: '2026-04-01T00:00:00Z', pushedAt: '2026-08-24T00:00:00Z',
});

const gofr = repo({
  ownerLogin: 'gofr-dev',
  stars: 20967, forks: 1758, watchers: 28, releases: 114,
  mergedPRCount: 1999, closedIssueCount: 1400,
  contributors: 380, commitsLastYear: 1100, languageCount: 5,
  createdAt: '2021-11-01T00:00:00Z', pushedAt: '2026-08-26T00:00:00Z',
});

const hyperfine = repo({
  ownerLogin: 'sharkdp',
  stars: 28747, forks: 506, watchers: 104, releases: 26,
  mergedPRCount: 466, closedIssueCount: 600,
  contributors: 130, commitsLastYear: 250, languageCount: 2,
  createdAt: '2018-01-01T00:00:00Z', pushedAt: '2026-08-10T00:00:00Z',
});

const react = repo({
  ownerLogin: 'facebook',
  stars: 247981, forks: 51254, watchers: 6600, releases: 150,
  mergedPRCount: 15000, closedIssueCount: 12000,
  contributors: 1700, commitsLastYear: 2200, languageCount: 4,
  createdAt: '2013-05-01T00:00:00Z', pushedAt: '2026-08-26T00:00:00Z',
});

const notSelf = { selfOwned: false };

describe('audienceRatio', () => {
  it('reproduces the table in issue #4', () => {
    expect(audienceRatio(ecoBuddy)).toBeCloseTo(0.01, 2);
    expect(audienceRatio(campusConnect)).toBeCloseTo(0.04, 2);
    expect(audienceRatio(paySphere)).toBeCloseTo(0.07, 2);
    expect(audienceRatio(gofr)).toBeCloseTo(9.78, 1);
    expect(audienceRatio(hyperfine)).toBeCloseTo(48.8, 0);
  });

  it('a repo with no forks and no PRs but some stars is not penalised', () => {
    expect(audienceRatio(repo({ stars: 40 }))).toBe(Infinity);
  });
});

describe('criticalityScore', () => {
  it('stays in [0, 1] and orders real projects above farms', () => {
    for (const r of [ecoBuddy, campusConnect, gofr, react]) {
      const c = criticalityScore(r, NOW);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(criticalityScore(react, NOW)).toBeGreaterThan(criticalityScore(gofr, NOW));
    expect(criticalityScore(gofr, NOW)).toBeGreaterThan(criticalityScore(ecoBuddy, NOW));
  });
});

describe('repoMultiplier', () => {
  it('farm repos land near the floor, real projects near the top', () => {
    expect(repoMultiplier(ecoBuddy, NOW, notSelf)).toBeLessThan(0.45);
    expect(repoMultiplier(campusConnect, NOW, notSelf)).toBeLessThan(0.5);
    expect(repoMultiplier(paySphere, NOW, notSelf)).toBeLessThan(0.5);
    expect(repoMultiplier(gofr, NOW, notSelf)).toBeGreaterThan(1.8);
    expect(repoMultiplier(hyperfine, NOW, notSelf)).toBeGreaterThan(1.6);
    expect(repoMultiplier(react, NOW, notSelf)).toBeGreaterThan(2.2);
  });

  it('never leaves [MULTIPLIER_MIN, MULTIPLIER_MAX]', () => {
    const worst = repo({ languageCount: 0, licenseSpdxId: null, isFork: true, topics: ['awesome'] });
    expect(repoMultiplier(worst, NOW, { selfOwned: true })).toBeGreaterThanOrEqual(MULTIPLIER_MIN);
    expect(repoMultiplier(react, NOW, notSelf)).toBeLessThanOrEqual(MULTIPLIER_MAX);
  });

  it('self-owned repos are crushed even when the repo itself is fine', () => {
    const asOwner = repoMultiplier(gofr, NOW, { selfOwned: true });
    const asContributor = repoMultiplier(gofr, NOW, notSelf);
    expect(asOwner).toBeLessThan(asContributor * 0.35);
  });

  it('curated orgs get a floor, not a fixed value', () => {
    const youngCncf = repo({
      ownerLogin: 'cncf', stars: 200, forks: 30, watchers: 8, releases: 2,
      contributors: 15, commitsLastYear: 300, mergedPRCount: 120,
      createdAt: '2026-05-01T00:00:00Z',
    });
    expect(repoMultiplier(youngCncf, NOW, notSelf)).toBeGreaterThanOrEqual(CURATED_ORG_FLOOR);
    // ...while established repos beat the floor on their own merits.
    expect(repoMultiplier(react, NOW, notSelf)).toBeGreaterThan(CURATED_ORG_FLOOR);
  });
});

describe('validity gate', () => {
  it('excludes the farm repos outright (no audience AND no releases)', () => {
    expect(isRepoValid(ecoBuddy)).toBe(false);
    expect(isRepoValid(campusConnect)).toBe(false);
    expect(isRepoValid(paySphere)).toBe(false);
  });

  it('keeps real projects, archived repos and forks are always out', () => {
    expect(isRepoValid(gofr)).toBe(true);
    expect(isRepoValid(hyperfine)).toBe(true);
    expect(isRepoValid(repo({ ...gofr, isArchived: true }))).toBe(false);
    expect(isRepoValid(repo({ ...gofr, isFork: true }))).toBe(false);
  });

  it('a small honest project with a release survives the gate', () => {
    const small = repo({ stars: 30, forks: 4, watchers: 2, releases: 3, mergedPRCount: 40 });
    expect(isRepoValid(small)).toBe(true);
  });
});

describe('prScore and per-repo decay (0.3)', () => {
  it('2nd PR into the same repo is worth 1/1.3 of the first', () => {
    expect(prScore(2, 2) / prScore(2, 1)).toBeCloseTo(1 / (1 + PER_REPO_DECAY), 10);
    expect(prScore(2, 3) / prScore(2, 1)).toBeCloseTo(1 / (1 + 2 * PER_REPO_DECAY), 10);
  });
});

describe('aggregateMergedPRScore', () => {
  const prsInto = (name: string, n: number) => Array.from({ length: n }, () => name);
  const id = (x: string) => x;

  it("the issue's headline case reverses: 43 PRs into gofr beat 74 into a weak repo", () => {
    // A 10-star repo that *passes* the validity gate (has releases) but is weak.
    const weak = repo({ stars: 10, forks: 8, watchers: 1, releases: 1, mergedPRCount: 200, contributors: 25, commitsLastYear: 250 });
    const weakM = repoMultiplier(weak, NOW, notSelf);
    const gofrM = repoMultiplier(gofr, NOW, notSelf);

    const farmTotal = aggregateMergedPRScore(prsInto('w/w', 74), id, () => weakM);
    const realTotal = aggregateMergedPRScore(prsInto('g/g', 43), id, () => gofrM);
    expect(realTotal).toBeGreaterThan(farmTotal);
  });

  it('caps every repo at 40% of the uncapped total', () => {
    const m = (r: string) => (r === 'big/big' ? 3 : 1.2);
    const spread = [...prsInto('big/big', 50), ...prsInto('a/a', 5), ...prsInto('b/b', 5)];
    // Reconstruct the uncapped subtotals directly from prScore to assert the cap.
    const sub = (n: number, mult: number) =>
      Array.from({ length: n }, (_, i) => prScore(mult, i + 1)).reduce((a, b) => a + b, 0);
    const big = sub(50, 3), a = sub(5, 1.2), b = sub(5, 1.2);
    const uncapped = big + a + b;
    const expected = Math.min(big, 0.4 * uncapped) + a + b;
    expect(aggregateMergedPRScore(spread, id, m)).toBeCloseTo(expected, 6);
  });

  it('a profile spread over three similar repos is untouched by the cap', () => {
    const even = [...prsInto('a/a', 5), ...prsInto('b/b', 5), ...prsInto('c/c', 5)];
    const sub = (n: number) =>
      Array.from({ length: n }, (_, i) => prScore(1.5, i + 1)).reduce((x, y) => x + y, 0);
    expect(aggregateMergedPRScore(even, id, () => 1.5)).toBeCloseTo(3 * sub(5), 6);
  });

  it('an all-in-one-repo profile scores 0.4× its raw subtotal', () => {
    const sub = (n: number) =>
      Array.from({ length: n }, (_, i) => prScore(2, i + 1)).reduce((x, y) => x + y, 0);
    expect(aggregateMergedPRScore(prsInto('only/one', 12), id, () => 2)).toBeCloseTo(0.4 * sub(12), 6);
  });

  it('more contribution never lowers the total (cap is monotonic)', () => {
    const m = (r: string) => (r === 'big/big' ? 3 : 0.5);
    const before = aggregateMergedPRScore(prsInto('big/big', 20), id, m);
    const after = aggregateMergedPRScore([...prsInto('big/big', 20), 'tiny/tiny'], id, m);
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('unknown repos (null) score at neutral weight instead of crashing', () => {
    const total = aggregateMergedPRScore([null, null], (x) => x, () => 99);
    expect(total).toBeGreaterThan(0);
  });
});

describe('legacyMultiplier (pre-migration cache entries)', () => {
  it('is stars-only, bounded, and roughly ordered', () => {
    expect(legacyMultiplier(0)).toBeGreaterThanOrEqual(MULTIPLIER_MIN);
    expect(legacyMultiplier(250000)).toBeLessThanOrEqual(MULTIPLIER_MAX);
    expect(legacyMultiplier(20000)).toBeGreaterThan(legacyMultiplier(10));
  });

  it('ignores forks entirely — the exact failure mode of the old formula', () => {
    // Old formula: 10 stars + 47 forks → weight 3.18 (half of React!).
    // Legacy fallback sees only the 10 stars.
    expect(legacyMultiplier(10)).toBeLessThan(1.0);
  });
});
