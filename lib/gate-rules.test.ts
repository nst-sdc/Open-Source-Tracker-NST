import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvRead: vi.fn(async () => ({ ok: true, value: null })), kvSet: vi.fn(async () => true), kvDel: vi.fn(async () => true) }));
vi.mock('./org-cache', () => ({ getOrgCache: vi.fn(async () => ({ jenkinsci: { isOrganization: true }, ghostmkg: { isOrganization: false } })) }));
vi.mock('./kv-students', () => ({ getStudentsKV: vi.fn(async () => [{ github: 'alice', previousLogins: ['alice-old'] }]) }));
const { DEFAULT_GATE_RULES, nstOwnerReason, practiceReason, buildGateContext, saveGateRules, _resetGateMemory } = await import('./gate-rules');
const { gateDecision } = await import('./repo-score');
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
