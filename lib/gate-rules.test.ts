import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvRead: vi.fn(async () => ({ ok: true, value: null })), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => true) }));
vi.mock('./org-cache', () => ({ getOrgCache: vi.fn(async () => ({ jenkinsci: { isOrganization: true }, ghostmkg: { isOrganization: false } })) }));
vi.mock('./kv-students', () => ({ getStudentsKV: vi.fn(async () => [{ github: 'alice', previousLogins: ['alice-old'] }]) }));
const { DEFAULT_GATE_RULES, nstOwnerReason, practiceReason, buildGateContext, saveGateRules, _resetGateMemory, realProjectReason } = await import('./gate-rules');
const { gateDecision, hasOrgPrior } = await import('./repo-score');
import type { RepoSignals } from './repo-score';

const sig = (over: Partial<RepoSignals> = {}): RepoSignals => ({
  stars: 300, forks: 10, watchers: 20, releases: 1, contributors: 5, commitsLastYear: 50, mergedPRCount: 40, closedIssueCount: 10,
  languageCount: 2, topics: [], licenseSpdxId: 'MIT', isFork: false, isArchived: false, ownerLogin: 'someone', createdAt: '2024-01-01', pushedAt: '2026-01-01', ...over,
});

describe('ownership rules', () => {
  it('spots NST owners by list and keyword, with whole-word matching for short keywords', () => {
    expect(nstOwnerReason('nst-sdc', DEFAULT_GATE_RULES)).toMatch(/owner list/);
    expect(nstOwnerReason('devforge-nst', DEFAULT_GATE_RULES)).toBeTruthy();
    expect(nstOwnerReason('Newton-Physics', DEFAULT_GATE_RULES)).toMatch(/newton/);
    expect(nstOwnerReason('constellation', DEFAULT_GATE_RULES)).toBeNull(); // "nst" inside a word does not count
    expect(nstOwnerReason('apache', DEFAULT_GATE_RULES)).toBeNull();
  });
  it('spots practice grounds by exact name, by name keyword and by topic', () => {
    expect(practiceReason('firstcontributions/first-contributions', [], DEFAULT_GATE_RULES)).toMatch(/listed/);
    expect(practiceReason('someone/Hacktoberfest2026', [], DEFAULT_GATE_RULES)).toMatch(/hacktoberfest/);
    expect(practiceReason('acme/widgets', ['hacktoberfest-accepted'], DEFAULT_GATE_RULES, 40)).toMatch(/hacktoberfest/);
    expect(practiceReason('meshery/meshery', ['hacktoberfest'], DEFAULT_GATE_RULES, 12000)).toBeNull(); // topic alone, big project
    expect(practiceReason('kubescape/kubescape', ['best-practices', 'good-first-issue'], DEFAULT_GATE_RULES, 10)).toBeNull(); // common topics never count
    expect(practiceReason('apache/airflow', ['workflow'], DEFAULT_GATE_RULES, 5)).toBeNull();
  });
});

describe('gateDecision with ownership context', () => {
  it('orders the checks: fork, NST, peer, practice, prior, star bar by owner kind, audience', async () => {
    _resetGateMemory();
    const ctx = await buildGateContext(true);
    expect(gateDecision(sig({ isFork: true }), undefined, ctx, 'apache/x').reason).toBe('fork');
    expect(gateDecision(sig(), undefined, ctx, 'nst-sdc/site').reason).toBe('nst-internal');
    expect(gateDecision(sig(), undefined, ctx, 'alice-old/thing').reason).toBe('peer');
    expect(gateDecision(sig({ stars: 50, topics: ['hacktoberfest'] }), undefined, ctx, 'acme/thing').reason).toBe('practice');
    expect(gateDecision(sig({ stars: 5000, topics: ['hacktoberfest'] }), undefined, ctx, 'acme/thing').valid).toBe(true);
    expect(gateDecision(sig({ stars: 5000 }), undefined, ctx, 'acme/Hacktoberfest2026').reason).toBe('practice');
    // A vouching owner beats the star bar and the topic keywords, not the exact list
    expect(gateDecision(sig({ stars: 3 }), { programOrg: true }, ctx, 'jupyterlab/eslint-plugin').valid).toBe(true);
    expect(gateDecision(sig({ stars: 30, topics: ['hacktoberfest'] }), { programOrg: true }, ctx, 'jenkins-infra/contributor-spotlight').valid).toBe(true);
    expect(gateDecision(sig({ stars: 56000 }), { programOrg: true }, ctx, 'firstcontributions/first-contributions').reason).toBe('practice');
    // Personal accounts need 200, organisations 50, unknown owners get the org bar
    expect(gateDecision(sig({ stars: 150 }), undefined, ctx, 'ghostmkg/thing')).toMatchObject({ valid: false, reason: 'under-star-minimum' });
    expect(gateDecision(sig({ stars: 150 }), undefined, ctx, 'jenkinsci/thing').valid).toBe(true);
    expect(gateDecision(sig({ stars: 40 }), undefined, ctx, 'jenkinsci/thing').valid).toBe(false);
    expect(gateDecision(sig({ stars: 60 }), undefined, ctx, 'nobody-knows/thing').valid).toBe(true);
    // Audience still applies above the bar
    expect(gateDecision(sig({ stars: 400, watchers: 0, forks: 2000, mergedPRCount: 5000, releases: 0 }), undefined, ctx, 'jenkinsci/farm').reason).toBe('no-audience');
  });
  it('without context behaves like the old stars-and-audience gate', () => {
    expect(gateDecision(sig({ stars: 4 })).reason).toBe('under-star-minimum');
    expect(gateDecision(sig({ stars: 6 })).valid).toBe(true);
  });
});

describe('saveGateRules', () => {
  it('normalises lists and numbers', async () => {
    const kv = await import('./kv');
    const kvSet = kv.kvSet as unknown as ReturnType<typeof vi.fn>;
    kvSet.mockClear();
    await saveGateRules({ ...DEFAULT_GATE_RULES, nstOwners: [' nst-sdc ', 'nst-sdc', ''], practiceRepos: ['bad', 'a/b'], practiceKeywords: ['HACK ', 'x'], minStarsPersonal: 250.7, minStarsOrg: -5 });
    const saved = kvSet.mock.calls[0][1];
    expect(saved.nstOwners).toEqual(['nst-sdc']);
    expect(saved.practiceRepos).toEqual(['a/b']);
    expect(saved.practiceKeywords).toEqual(['hack', 'x']);
    expect(saved.minStarsPersonal).toBe(250);
    expect(saved.minStarsOrg).toBe(0);
  });
});

describe('audit tuning (2026-11-20)', () => {
  it('lifts a practice topic from a repo that is plainly a real project, never from a collection or a farm', async () => {
    _resetGateMemory();
    const ctx = await buildGateContext(true);
    // fury-gl/fury: 304 stars, 102 contributors, 15 releases, hacktoberfest topic, organisation
    const fury = sig({ stars: 304, forks: 180, watchers: 20, releases: 15, contributors: 102, mergedPRCount: 900, languageCount: 3, topics: ['scientific-visualization', 'hacktoberfest'] });
    expect(gateDecision(fury, undefined, ctx, 'jenkinsci/fury').valid).toBe(true);
    // same signals under a personal account fail the 200 bar, so the topic verdict stands
    expect(gateDecision({ ...fury, stars: 150 }, undefined, ctx, 'ghostmkg/fury').reason).toBe('practice');
    // a farm: hundreds of contributors, no releases, no audience
    const farm = sig({ stars: 401, forks: 3000, watchers: 5, releases: 0, contributors: 1584, mergedPRCount: 4000, languageCount: 3, topics: ['css', 'art', 'hacktoberfest'] });
    expect(gateDecision(farm, undefined, ctx, 'jenkinsci/animation-nation').reason).toBe('practice');
    // a collection with releases still fails on its marker
    const list = sig({ stars: 557, releases: 9, contributors: 38, languageCount: 2, topics: ['nodejs', 'resources', 'hacktoberfest'] });
    expect(gateDecision(list, undefined, ctx, 'jenkinsci/Ultimate-NodeJs-Resources').reason).toBe('practice');
    // the exact practice list and a practice keyword in the name are never lifted
    expect(gateDecision({ ...fury, stars: 56000 }, undefined, ctx, 'firstcontributions/first-contributions').reason).toBe('practice');
    expect(gateDecision(fury, undefined, ctx, 'jenkinsci/Hacktoberfest-Starter').reason).toBe('practice');
    expect(realProjectReason('acme/thing', { stars: 300, releases: 0, contributors: 18, languageCount: 1, topics: [], audience: 17.4 }, 50)).toMatch(/18 contributors/);
    expect(realProjectReason('acme/thing', { stars: 300, releases: 0, contributors: 18, languageCount: 0, topics: [], audience: 17.4 }, 50)).toBeNull();
  });
  it('lets a strong owner vouch for its small repos by stars, through the gate only', async () => {
    _resetGateMemory();
    const ctx = await buildGateContext(true);
    const small = sig({ stars: 17, topics: ['hacktoberfest'], ownerType: 'Organization' });
    expect(gateDecision(small, { programOrg: false, maxStarsInOrg: 1154 }, ctx, 'layer5io/discuss-theme').valid).toBe(true);
    expect(gateDecision(small, { programOrg: false, maxStarsInOrg: 999 }, ctx, 'layer5io/discuss-theme').valid).toBe(false);
    expect(gateDecision(small, { programOrg: false, maxStarsInOrg: 1154 }, { ...ctx, rules: { ...ctx.rules, strongOrgMinStars: 0 } }, 'layer5io/discuss-theme').valid).toBe(false);
    // only organisations: a personal account's 2,660-star Hacktoberfest2026 vouches for nothing beside it
    const personal = sig({ stars: 917, topics: ['hacktoberfest'], ownerType: 'User' });
    expect(gateDecision(personal, { programOrg: false, maxStarsInOrg: 2660 }, ctx, 'fineanmol/hacktoberfest').reason).toBe('practice');
    expect(gateDecision({ ...personal, topics: [] }, { programOrg: false, maxStarsInOrg: 2660 }, ctx, 'fineanmol/some-tool').valid).toBe(true); // 917 clears the personal bar on its own
    expect(gateDecision({ ...personal, topics: [], stars: 60 }, { programOrg: false, maxStarsInOrg: 2660 }, ctx, 'fineanmol/some-tool').reason).toBe('under-star-minimum');
    // an unclassified owner gets no credit; a practice-named repo under a real org gets none either
    expect(gateDecision({ ...small, ownerType: undefined }, { programOrg: false, maxStarsInOrg: 1154 }, ctx, 'unknownco/discuss-theme').valid).toBe(false);
    expect(gateDecision({ ...small, stars: 400 }, { programOrg: false, maxStarsInOrg: 1154 }, ctx, 'layer5io/Hacktoberfest-Starter').reason).toBe('practice');
    // program and vouched owners keep vouching regardless of kind
    expect(gateDecision({ ...personal, stars: 3 }, { programOrg: true }, ctx, 'jenkins-infra/hacktoberfest').valid).toBe(true);
    // listed collections under a strong org stay out
    expect(gateDecision({ ...small, stars: 401 }, { programOrg: false, maxStarsInOrg: 5000 }, ctx, 'zero-to-mastery/Animation-Nation').reason).toBe('practice');
    expect(hasOrgPrior({ programOrg: false, maxStarsInOrg: 5000 })).toBe(false); // scoring never uses it
    expect(hasOrgPrior({ programOrg: false, maxStarsInOrg: 5000 }, 1000)).toBe(true);
  });
  it('uses the owner type carried by the signals while the owner is unclassified', async () => {
    _resetGateMemory();
    const ctx = await buildGateContext(true);
    expect(gateDecision(sig({ stars: 179, ownerType: 'User' }), undefined, ctx, 'vmDeshpande/ai-agent-automation').reason).toBe('under-star-minimum');
    expect(gateDecision(sig({ stars: 179, ownerType: 'Organization' }), undefined, ctx, 'Checkora/Checkora').valid).toBe(true);
    expect(gateDecision(sig({ stars: 179 }), undefined, ctx, 'nobody-knows/thing').valid).toBe(true); // nothing known: org bar, as before
    expect(gateDecision(sig({ stars: 179, ownerType: 'Organization' }), undefined, ctx, 'ghostmkg/thing').reason).toBe('under-star-minimum'); // the org cache wins
  });
  it('matches practice keywords across separators and short ones as whole words', () => {
    expect(practiceReason('dhairyagothi/100_days_100_web_project', [], DEFAULT_GATE_RULES)).toMatch(/100-days/);
    expect(practiceReason('ghostmkg/dsa-code', [], DEFAULT_GATE_RULES)).toMatch(/dsa/);
    expect(practiceReason('noodles-sed/Simple_DSA', [], DEFAULT_GATE_RULES)).toMatch(/dsa/);
    expect(practiceReason('acme/lambdsa-runtime', [], DEFAULT_GATE_RULES)).toBeNull();
    expect(practiceReason('sympy/sympy', ['python', 'hacktoberfest'], DEFAULT_GATE_RULES, 15098)).toBeNull();
  });
});
