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
  updatedAt?: string;
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
    'open-source-practice', '100-days', '30-days', 'awesome-list', 'interview', 'roadmap', 'tutorial',
  ],
  practiceTopicKeywords: [
    'hacktoberfest', 'hacktober', 'first-contribution', 'firstcontribution', 'learn-git', 'git-practice',
    'contribute-to-this', 'dev-wall', 'workbook', 'gssoc', 'ecsoc', 'swoc', '100-days', '30-days', 'awesome-list',
  ],
  practiceTopicMaxStars: 1000,
  minStarsPersonal: 200,
  minStarsOrg: 50,
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
  const full = repoFullName.toLowerCase();
  for (const k of rules.practiceKeywords) {
    const kw = k.toLowerCase();
    if (kw && full.includes(kw)) return `practice keyword "${k}" in the name`;
  }
  if (stars < rules.practiceTopicMaxStars) {
    const ts = topics.map((t) => t.toLowerCase());
    for (const k of rules.practiceTopicKeywords) {
      const kw = k.toLowerCase();
      if (kw && ts.some((t) => t.includes(kw))) return `topic "${k}" on a repository under ${rules.practiceTopicMaxStars} stars`;
    }
  }
  return null;
}

export type OwnerKind = 'org' | 'user' | 'unknown';

/** What the gate needs to know about a repo beyond its signals. */
export interface GateContext {
  rules: GateRules;
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
