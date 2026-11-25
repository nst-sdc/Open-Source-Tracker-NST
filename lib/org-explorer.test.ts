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
    // Umbrellas carry their own login, not a member's, and know their member projects.
    const numfocus = data.cards.find((c) => c.login === 'numfocus')!;
    expect(numfocus.gsocSlug).toBe('numfocus');
    expect(numfocus.umbrella).toEqual({ members: expect.any(Number), subOrgs: 20, latestYear: 2026, program: 'numfocus' });
    expect(numfocus.umbrella!.members).toBeGreaterThan(10);
    expect(numfocus.gsocSlots?.['2025']).toBe(31);
    expect(data.cards.find((c) => c.login === 'psf')?.umbrella).toEqual({ members: expect.any(Number), subOrgs: 10, latestYear: 2026 });
    // A sub-organisation the ideas list names, even with no code link yet, is a GSoC organisation here.
    const gammapy = data.cards.find((c) => c.login.toLowerCase() === 'gammapy')!;
    expect(gammapy.via?.[0]).toMatchObject({ slug: 'numfocus', listed: expect.arrayContaining([2026]) });
    expect(gammapy.programs).toContain('gsoc');
    // ...and the member projects point back: pvlib ran GSoC projects under NumFOCUS.
    const pvlib = data.cards.find((c) => c.login.toLowerCase() === 'pvlib')!;
    expect(pvlib.via?.map((p) => p.slug)).toEqual(['numfocus']);
    expect(pvlib.via![0].listed).toEqual(expect.arrayContaining([2022, 2026]));
    expect(pvlib.programs).toContain('gsoc');
    expect(pvlib.gsocSlots).toBeDefined();
    expect(Object.values(pvlib.gsocSlots!).reduce((a, n) => a + n, 0)).toBe(pvlib.via![0].projects);
    expect(Object.keys(pvlib.via![0].repos)).toContain('pvlib-python');
    expect(numfocus.via).toBeUndefined();
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
