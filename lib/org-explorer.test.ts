import { describe, it, expect } from 'vitest';
import { buildOrgExplorer, programMembership } from './org-explorer';

describe('org explorer', () => {
  it('maps programme sections to filters and tags, case-insensitively', () => {
    const m = programMembership(['Jenkins-Infra']);
    expect(m.get('apache')?.programs.has('apache')).toBe(true);
    expect(m.get('sympy')?.programs.has('gsoc')).toBe(true);
    expect([...(m.get('sympy')?.tags ?? [])]).toContain('GSoC');
    expect(m.get('sympy')?.years.has(2026)).toBe(true);
    expect(m.get('jenkins-infra')?.programs.has('vouched')).toBe(true);
  });

  it('counts contributors and merges per organisation, keeps programme orgs without contributors, drops personal accounts', () => {
    const data = buildOrgExplorer({
      index: {
        sympy: { login: 'sympy', contributors: { Alice: 3, bob: 1, gone: 2 }, mergedPRs: 6, contributorRepos: { Alice: { 'sympy/sympy': 3 }, bob: { 'sympy/sympy_doc': 1 } } },
        someuser: { login: 'someuser', contributors: { Alice: 9 }, mergedPRs: 9 },
        mysteryorg: { login: 'MysteryOrg', contributors: { bob: 2 }, mergedPRs: 2 },
        firstcontributions: { login: 'firstcontributions', contributors: { Alice: 1, bob: 1 }, mergedPRs: 2 },
      },
      repoCache: {
        'sympy/sympy': { stars: 15000, forks: 1, valid: true },
        'firstcontributions/first-contributions': { stars: 50000, forks: 1, valid: false },
      },
      orgCache: {
        sympy: { login: 'sympy', name: 'SymPy', type: 'Organization', isOrganization: true, description: 'Symbolic maths', avatarUrl: 'https://a/sympy.png', checkedAt: '' },
        someuser: { login: 'someuser', type: 'User', isOrganization: false, checkedAt: '' },
      },
      roster: new Set(['alice', 'bob']),
      now: new Date('2026-11-24T00:00:00Z'),
    });
    const sympy = data.cards.find((c) => c.login === 'sympy')!;
    expect(sympy.name).toBe('SymPy');
    expect(sympy.contributors).toBe(2); // "gone" left the roster
    expect(sympy.mergedPRs).toBe(4);
    expect(sympy.top.map((t) => t.login)).toEqual(['Alice', 'bob']);
    expect(sympy.programs).toContain('gsoc');
    expect(sympy.topRepo).toEqual({ repo: 'sympy/sympy', merged: 3 });
    expect(data.cards.find((c) => c.login === 'KDE')?.programs).toEqual(expect.arrayContaining(['sok', 'outreachy']));
    expect(data.counts.sob.orgs).toBeGreaterThan(10);
    expect(data.cards.find((c) => c.login === 'someuser')).toBeUndefined();
    expect(data.cards.find((c) => c.login === 'firstcontributions')).toBeUndefined(); // only excluded repos
    expect(data.counts.all.contributors).toBe(2); // alice and bob, distinct
    const mystery = data.cards.find((c) => c.login === 'MysteryOrg')!;
    expect(mystery.contributors).toBe(1);
    expect(mystery.avatarUrl).toBe('https://github.com/MysteryOrg.png?size=96');
    expect(data.cards.some((c) => c.login.toLowerCase() === 'apache' && c.contributors === 0)).toBe(true);
    expect(data.cards[0].login).toBe('sympy'); // most contributors first
    expect(data.counts.all.withContributors).toBe(2);
    expect(data.counts.gsoc.orgs).toBeGreaterThan(500);
    // the dataset fills in years, slug, and name/description for organisations the org cache lacks
    const apache = data.cards.find((c) => c.login.toLowerCase() === 'apache')!;
    expect(apache.gsocSlug).toBeTruthy();
    expect(apache.years).toContain(2026);
    expect(apache.description).toBeTruthy();
    expect(sympy.years?.length).toBeGreaterThan(5);
    // GSoC organisations without a GitHub organisation are listed too, pointing at their site
    const mailman = data.cards.find((c) => c.name === 'GNU Mailman Project')!;
    expect(mailman.site).toBe(true);
    expect(mailman.programs).toEqual(['gsoc']);
    expect(mailman.url).toMatch(/^https?:\/\//);
    // LFX history rides on the card
    const hl = data.cards.find((c) => c.login.toLowerCase() === 'hyperledger')!;
    expect(hl.programs).toContain('lfx');
    expect(hl.lfx?.projects).toBeGreaterThan(50);
    expect(hl.lfx?.years).toContain(2023);
  });
});
