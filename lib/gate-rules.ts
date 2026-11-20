/**
 * lib/gate-rules.ts
 *
 * The ownership half of the validity gate, editable by admins. Where
 * lib/repo-score.ts asks "is this repository substantial?", this asks
 * "whose is it, and what is it for?":
 *
 *   - NST-owned: the club's and the college's orgs, and owners whose login
 *     carries an NST keyword. Real work, but internal: shown on the
 *     student's page, never scored as open source.
 *   - Peer-owned: a repository owned by another tracked student. Same
 *     treatment (an admin own-repo exception still lets a vetted one in).
 *   - Practice: hacktoberfest/first-contribution style grounds, by exact
 *     name or by keyword in the name or topics.
 *   - Star bars by owner kind: a personal account needs more stars than an
 *     organisation, because a personal repo with 100 forks and 20 stars is
 *     the signature of a classroom, not a project.
 *
 * Measured on 2026-11-20 before this shipped, ~2,700 of 6,875 counted
 * merged PRs were club, peer or practice work. The rules live in KV so an
 * admin can tune them from the dashboard; the defaults below seed it.
 */
import { kvRead, kvSet } from './kv';
import { getOrgCache } from './org-cache';
import { getStudentsKV } from './kv-students';

export const KV_KEY = 'gate_rules';

export interface GateRules {
  /** Owner logins that are NST's own (case-insensitive). */
  nstOwners: string[];
  /** An owner whose login contains one of these is NST-internal. Keywords of
   *  four letters or fewer must match a whole hyphen/underscore-separated word. */
  nstOwnerKeywords: string[];
  /** Exact owner/name of practice grounds. */
  practiceRepos: string[];
  /** A repo whose name or owner contains one of these is practice. */
  practiceKeywords: string[];
  /** A repo whose GitHub topics contain one of these is practice, but only
   *  below practiceTopicMaxStars: a 12,000-star project tagged hacktoberfest
   *  is a project that welcomes newcomers, not a practice ground. Kept
   *  narrower than the name keywords because topics like good-first-issue
   *  and best-practices are standard on serious repositories. */
  practiceTopicKeywords: string[];
  practiceTopicMaxStars: number;
  /** Stars a personal account's repo needs to count. */
  minStarsPersonal: number;
  /** Stars an organisation's repo needs to count (org priors still vouch below it). */
  minStarsOrg: number;
  /** An owner with any repo at or above this many stars vouches for its
   *  other repos: they skip the star bar and the topic keywords (not the
   *  exact practice list). Found on the live data: layer5io and hackclub
   *  sub-repos with 10-30 stars under a 1,100-star flagship were out. */
  strongOrgMinStars: number;
  updatedAt?: string;
}

/** A repository that carries a practice topic (hacktoberfest, gssoc…) but is
 *  plainly a real project: it clears the star bar for its owner kind, has
 *  code, has no collection marker in its name or topics, and either ships
 *  releases or has a real contributor base with an audience. Measured on the
 *  live data this readmits fury-gl/fury, scribe-org/Scribe-iOS,
 *  graycoreio/daffodil, CycloneDX/cyclonedx-node-npm and a dozen like them,
 *  and keeps every hacktoberfest farm out (they fail the audience or the
 *  marker test). */
export const REAL_PROJECT = {
  minReleases: 5,
  minContributors: 15,
  minAudience: 1,
  /** Substrings of a name or topic that mark a collection rather than software. */
  collectionMarkers: ['awesome', 'roadmap', 'tutorial', 'interview', 'resources', 'projects', 'beginner', 'cheat', 'notes', 'question', '100-days', '30-days', 'collection', 'practice', 'first-contrib', 'portfolio', 'namecard'],
} as const;

export interface RealProjectSignals {
  stars: number;
  releases: number;
  contributors: number;
  languageCount: number;
  topics: readonly string[];
  /** (stars + 5·watchers) / (forks + 0.2·merged PRs); see repo-score.ts audienceRatio. */
  audience: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, '-');

/** Pure. Why a practice-topic repo is nevertheless a real project, or null. */
export function realProjectReason(repoFullName: string, s: RealProjectSignals, starBar: number): string | null {
  if (s.stars < starBar) return null;
  if (s.languageCount <= 0) return null;
  const name = norm(repoFullName.split('/')[1] ?? repoFullName);
  const topics = s.topics.map(norm);
  for (const m of REAL_PROJECT.collectionMarkers) {
    if (name.includes(m) || topics.some((t) => t.includes(m))) return null;
  }
  if (s.releases >= REAL_PROJECT.minReleases) return `${s.releases} releases on a ${s.stars}-star repository`;
  if (s.contributors >= REAL_PROJECT.minContributors && s.audience >= REAL_PROJECT.minAudience) {
    return `${s.contributors} contributors and an audience ratio of ${s.audience.toFixed(2)} on a ${s.stars}-star repository`;
  }
  return null;
}

export const DEFAULT_GATE_RULES: GateRules = {
  nstOwners: ['nst-sdc', 'NST-DEVFORGE', 'S-AI-Projects', 'Newton-School', 'devforge-nst', 'devclub-nstru', 'SASTxNST', 'DCODE-HQ'],
  nstOwnerKeywords: ['nst', 'newton', 'devforge', 'adypu', 'rishihood', 'svyasa', 'smru'],
  practiceRepos: [
    'firstcontributions/first-contributions',
    'zero-to-mastery/start-here-guidelines',
    'MunGell/awesome-for-beginners',
    'github/docs-content-practice',
    'Syknapse/Contribute-To-This-Project',
    'codeisscience/first-contribution',
  ],
  practiceKeywords: [
    'first-contribution', 'firstcontribution', 'hacktoberfest', 'hacktober', 'beginner', 'practice', 'good-first',
    'learn-git', 'git-practice', 'contribute-to-this', 'dev-wall', 'workbook', 'gssoc', 'ecsoc', 'swoc',
    'open-source-practice', '100-days', '30-days', 'awesome-list', 'interview', 'roadmap', 'tutorial', 'dsa',
  ],
  practiceTopicKeywords: [
    'hacktoberfest', 'hacktober', 'first-contribution', 'firstcontribution', 'learn-git', 'git-practice',
    'contribute-to-this', 'dev-wall', 'workbook', 'gssoc', 'ecsoc', 'swoc', '100-days', '30-days', 'awesome-list',
  ],
  practiceTopicMaxStars: 1000,
  minStarsPersonal: 200,
  minStarsOrg: 50,
  strongOrgMinStars: 1000,
};

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Pure. Why an owner is NST-internal, or null. */
export function nstOwnerReason(owner: string, rules: GateRules): string | null {
  const lower = owner.toLowerCase();
  if (rules.nstOwners.some((o) => o.toLowerCase() === lower)) return `owner ${owner} is on the NST owner list`;
  const ws = words(lower);
  for (const k of rules.nstOwnerKeywords) {
    const kw = k.toLowerCase();
    if (!kw) continue;
    if (kw.length <= 4 ? ws.includes(kw) : lower.includes(kw)) return `owner ${owner} matches NST keyword "${k}"`;
  }
  return null;
}

/** Pure. Why a repo is a practice ground by its exact name, or null. */
export function listedPracticeReason(repoFullName: string, rules: GateRules): string | null {
  return rules.practiceRepos.some((r) => r.toLowerCase() === repoFullName.toLowerCase()) ? 'listed practice repository' : null;
}

/** Pure. Why a repo is a practice ground by keyword, or null. */
export function practiceReason(repoFullName: string, topics: readonly string[], rules: GateRules, stars = 0): string | null {
  const listed = listedPracticeReason(repoFullName, rules);
  if (listed) return listed;
  // "100_days_100_web_project" and "100-days" are the same word; a keyword
  // of four letters or fewer ("dsa") must be a whole word so it never fires
  // inside another ("lambdsa").
  const full = norm(repoFullName);
  const ws = words(full);
  for (const k of rules.practiceKeywords) {
    const kw = norm(k);
    if (!kw) continue;
    if (kw.length <= 4 ? ws.includes(kw) : full.includes(kw)) return `practice keyword "${k}" in the name`;
  }
  if (stars < rules.practiceTopicMaxStars) {
    const ts = topics.map(norm);
    for (const k of rules.practiceTopicKeywords) {
      const kw = norm(k);
      if (kw && ts.some((t) => t.includes(kw))) return `topic "${k}" on a repository under ${rules.practiceTopicMaxStars} stars`;
    }
  }
  return null;
}

/** Pure. True when the practice verdict came from a topic (not the name or
 *  the exact list) and so may be lifted by realProjectReason. */
export function isTopicPracticeReason(reason: string | null): boolean {
  return !!reason && reason.startsWith('topic "');
}

export type OwnerKind = 'org' | 'user' | 'unknown';

/** What the gate needs to know about a repo beyond its signals. */
export interface GateContext {
  rules: GateRules;
  /** From org_cache_map; 'unknown' until the refresh tick classifies the owner. */
  ownerKind: (owner: string) => OwnerKind;
  isPeerOwner: (owner: string) => boolean;
}

let lastGood: GateRules | null = null;

export async function getGateRules(): Promise<GateRules> {
  const { ok, value } = await kvRead<GateRules>(KV_KEY);
  if (ok && value && Array.isArray(value.nstOwners)) {
    lastGood = { ...DEFAULT_GATE_RULES, ...value };
    return lastGood;
  }
  if (ok) return DEFAULT_GATE_RULES;
  return lastGood ?? DEFAULT_GATE_RULES;
}

export async function saveGateRules(rules: GateRules): Promise<boolean> {
  const clean: GateRules = {
    nstOwners: [...new Set(rules.nstOwners.map((s) => s.trim()).filter(Boolean))],
    nstOwnerKeywords: [...new Set(rules.nstOwnerKeywords.map((s) => s.trim().toLowerCase()).filter(Boolean))],
    practiceRepos: [...new Set(rules.practiceRepos.map((s) => s.trim()).filter((s) => /^[^/\s]+\/[^/\s]+$/.test(s)))],
    practiceKeywords: [...new Set(rules.practiceKeywords.map((s) => s.trim().toLowerCase()).filter(Boolean))],
    practiceTopicKeywords: [...new Set((rules.practiceTopicKeywords ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean))],
    practiceTopicMaxStars: Math.max(0, Math.floor(Number(rules.practiceTopicMaxStars) || 0)),
    minStarsPersonal: Math.max(0, Math.floor(Number(rules.minStarsPersonal) || 0)),
    minStarsOrg: Math.max(0, Math.floor(Number(rules.minStarsOrg) || 0)),
    strongOrgMinStars: Math.max(0, Math.floor(Number(rules.strongOrgMinStars) || 0)),
    updatedAt: new Date().toISOString(),
  };
  const ok = await kvSet(KV_KEY, clean);
  if (ok) lastGood = clean;
  return ok;
}

let ctxCache: { at: number; ctx: GateContext } | null = null;
const CTX_TTL_MS = 5 * 60 * 1000;

/**
 * Builds the context once per few minutes per process: the rules, which
 * owners GitHub says are organisations (lib/org-cache.ts, filled by the
 * refresh tick), and which owners are tracked students.
 */
export async function buildGateContext(force = false): Promise<GateContext> {
  if (!force && ctxCache && Date.now() - ctxCache.at < CTX_TTL_MS) return ctxCache.ctx;
  const [rules, orgCache, students] = await Promise.all([getGateRules(), getOrgCache(), getStudentsKV()]);
  const kinds = new Map<string, OwnerKind>();
  for (const [k, v] of Object.entries(orgCache)) kinds.set(k.toLowerCase(), v.isOrganization ? 'org' : 'user');
  const peers = new Set<string>();
  for (const s of students) {
    peers.add(s.github.toLowerCase());
    for (const p of s.previousLogins ?? []) peers.add(p.toLowerCase());
  }
  const ctx: GateContext = {
    rules,
    ownerKind: (o) => kinds.get(o.toLowerCase()) ?? 'unknown',
    isPeerOwner: (o) => peers.has(o.toLowerCase()),
  };
  ctxCache = { at: Date.now(), ctx };
  return ctx;
}

/** Test hook. */
export function _resetGateMemory(): void {
  lastGood = null;
  ctxCache = null;
}
