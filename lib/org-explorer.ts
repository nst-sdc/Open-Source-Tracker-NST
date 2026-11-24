/**
 * lib/org-explorer.ts
 *
 * The organisations page: every organisation our students have merged into
 * (the org index) and every organisation on a programme list (GSoC, LFX,
 * CNCF, Eclipse, NumFOCUS, Apache, foundations, NST-vouched), as cards with
 * how many of our contributors each has, their merged PRs there, and the
 * programmes the organisation belongs to. Metadata (name, description,
 * avatar) comes from the org cache, filled by GitHub's API as owners are
 * classified; an organisation not yet in it still gets GitHub's avatar by
 * login. Pure aggregation here; the page reads the stores.
 */
import programOrgs from '@/data/program-orgs.json';
import explorerPrograms from '@/data/explorer-programs.json';
import gsocOrgsJson from '@/data/gsoc-orgs.json';
import { busiestRepo, type OrgIndex } from './org-index';
import { PROGRAM_FILTERS, type ProgramKey, type OrgCard, type OrgExplorerData, type GsocOrg } from './org-explorer-types';

export { PROGRAM_FILTERS, type ProgramKey, type OrgCard, type OrgExplorerData, type GsocOrg } from './org-explorer-types';

/** The GSoC dataset (2016–2026), one record per organisation. */
export const GSOC_ORGS: ReadonlyArray<GsocOrg> = gsocOrgsJson as GsocOrg[];

/** Dataset record by lower-case GitHub login, for organisations that have one. */
const GSOC_BY_LOGIN: ReadonlyMap<string, GsocOrg> = new Map(GSOC_ORGS.filter((o) => o.github).map((o) => [o.github!.toLowerCase(), o]));
import type { OrgCacheMap } from './org-cache';
import type { RepoCacheMap } from './repo-cache';

/** Which programme filter each section of the data files feeds, and the tag
 *  it shows. GSoC sections are per year (`gsoc2024`) and resolve by pattern. */
const SECTION_TO_PROGRAM: Record<string, { key: ProgramKey; tag: string }> = {
  gsoc: { key: 'gsoc', tag: 'GSoC' },
  'gsoc-archive': { key: 'gsoc', tag: 'GSoC' },
  lfx: { key: 'lfx', tag: 'LFX' },
  cncf: { key: 'cncf', tag: 'CNCF' },
  eclipse: { key: 'eclipse', tag: 'Eclipse' },
  numfocus: { key: 'numfocus', tag: 'NumFOCUS' },
  apache: { key: 'apache', tag: 'Apache' },
  foundations: { key: 'foundations', tag: 'Foundation' },
  // data/explorer-programs.json (labels only, never the gate)
  sok: { key: 'sok', tag: 'Season of KDE' },
  'summer-of-bitcoin': { key: 'sob', tag: 'Summer of Bitcoin' },
  lfdt: { key: 'lfdt', tag: 'LFDT' },
  outreachy: { key: 'outreachy', tag: 'Outreachy' },
  esoc: { key: 'esoc', tag: 'ESoC' },
  codeheat: { key: 'codeheat', tag: 'Codeheat' },
  ospp: { key: 'ospp', tag: 'OSPP' },
};

/** The first sentence or so of a dataset description, for the card. */
function shortText(text: string | undefined, max = 220): string | undefined {
  if (!text) return undefined;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '));
  return `${cut.slice(0, end > 80 ? end : max).trimEnd()}…`;
}

/** Programme membership of every listed organisation, keyed by lower-case login. */
export interface Membership { login: string; programs: Set<ProgramKey>; tags: Set<string>; years: Set<number> }

export function programMembership(vouched: ReadonlyArray<string> = []): Map<string, Membership> {
  const out = new Map<string, Membership>();
  const add = (login: string, key: ProgramKey, tag: string, year?: number) => {
    const lower = login.toLowerCase();
    const e = out.get(lower) ?? { login, programs: new Set<ProgramKey>(), tags: new Set<string>(), years: new Set<number>() };
    e.programs.add(key);
    e.tags.add(tag);
    if (year) e.years.add(year);
    out.set(lower, e);
  };
  for (const source of [programOrgs, explorerPrograms] as Array<Record<string, unknown>>) {
    for (const [section, logins] of Object.entries(source)) {
      const year = /^gsoc(\d{4})$/.exec(section)?.[1];
      // GSoC years collapse into one tag; the years themselves ride along for the explorer's year filter.
      const m = year ? { key: 'gsoc' as const, tag: 'GSoC' } : SECTION_TO_PROGRAM[section];
      if (!m || !Array.isArray(logins)) continue;
      for (const login of logins as string[]) add(login, m.key, m.tag, year ? Number(year) : undefined);
    }
  }
  for (const login of vouched) add(login, 'vouched', 'NST vouched');
  return out;
}

export function buildOrgExplorer(input: {
  index: OrgIndex;
  orgCache: OrgCacheMap;
  /** The repo cache: an organisation whose repos are all excluded by the gate
   *  (practice grounds, NST's own, peers' projects) is not a place to
   *  contribute and stays off the page however many merges it has. */
  repoCache?: RepoCacheMap;
  vouched?: ReadonlyArray<string>;
  /** Roster logins (lower) so contributors who left the roster do not count. */
  roster?: ReadonlySet<string>;
  now?: Date;
}): OrgExplorerData {
  const membership = programMembership(input.vouched ?? []);
  const cards = new Map<string, OrgCard>();

  const cardFor = (login: string): OrgCard => {
    const lower = login.toLowerCase();
    const existing = cards.get(lower);
    if (existing) return existing;
    const meta = input.orgCache[lower];
    const member = membership.get(lower);
    const gsoc = GSOC_BY_LOGIN.get(lower);
    const display = meta?.login ?? member?.login ?? gsoc?.github ?? login;
    const years = new Set<number>([...(member?.years ?? []), ...(gsoc?.years ?? [])]);
    const card: OrgCard = {
      login: display,
      // GitHub's profile first; the GSoC dataset fills in for organisations the classifier has not reached.
      name: meta?.name || gsoc?.name || display,
      // The card shows two lines; the sheet reads the full text from the dataset.
      description: meta?.description || shortText(gsoc?.description) || undefined,
      avatarUrl: meta?.avatarUrl || `https://github.com/${display}.png?size=96`,
      url: `https://github.com/${display}`,
      contributors: 0,
      mergedPRs: 0,
      top: [],
      people: [],
      programs: member ? [...member.programs] : [],
      tags: member ? [...member.tags] : [],
    };
    if (years.size) card.years = [...years].sort((a, b) => a - b);
    if (gsoc) card.gsocSlug = gsoc.slug;
    cards.set(lower, card);
    return card;
  };

  // Owners with at least one repo the gate counts; an owner seen only through
  // excluded repos is left out. Owners the repo cache has never seen pass.
  const counted = new Set<string>();
  const seen = new Set<string>();
  for (const [full, entry] of Object.entries(input.repoCache ?? {})) {
    const owner = full.split('/')[0]?.toLowerCase();
    if (!owner) continue;
    seen.add(owner);
    if (entry.valid) counted.add(owner);
  }

  // Organisations our students merged into, with the counts.
  for (const [key, entry] of Object.entries(input.index)) {
    const lower = (entry.login || key).toLowerCase();
    const meta = input.orgCache[lower];
    // The index also holds personal accounts students merged into; only
    // organisations belong on this page. Unknown owners are kept: most are
    // organisations the classifier has not reached.
    if (meta && !meta.isOrganization) continue;
    if (seen.has(lower) && !counted.has(lower)) continue;
    const card = cardFor(entry.login || key);
    const people = Object.entries(entry.contributors).filter(([login, merged]) => merged > 0 && (!input.roster || input.roster.has(login.toLowerCase())));
    card.contributors = people.length;
    card.mergedPRs = people.reduce((a, [, n]) => a + n, 0);
    card.top = people.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([login, merged]) => ({ login, merged }));
    card.people = people.map(([login]) => login.toLowerCase());
    const busiest = busiestRepo(entry);
    if (busiest) card.topRepo = busiest;
  }
  // Programme organisations nobody has merged into yet: still worth exploring.
  for (const [lower, m] of membership) if (!cards.has(lower)) cardFor(m.login);
  // GSoC organisations without a GitHub organisation (GNU Mailman, Netfilter, …):
  // listed all the same, pointing at their website.
  for (const o of GSOC_ORGS) {
    if (o.github) continue;
    const key = `gsoc:${o.slug}`;
    if (cards.has(key)) continue;
    cards.set(key, {
      login: o.slug,
      name: o.name,
      description: shortText(o.description) || undefined,
      avatarUrl: o.image ?? '',
      url: o.url ?? `https://www.gsocorganizations.dev/organization/${o.slug}/`,
      contributors: 0,
      mergedPRs: 0,
      top: [],
      people: [],
      programs: ['gsoc'],
      tags: ['GSoC'],
      years: [...o.years],
      gsocSlug: o.slug,
      site: true,
    });
  }

  const list = [...cards.values()]
    .filter((c) => c.contributors > 0 || c.programs.length > 0)
    .sort((a, b) => b.contributors - a.contributors || b.mergedPRs - a.mergedPRs || a.login.localeCompare(b.login));

  const counts = {} as OrgExplorerData['counts'];
  const tally = (key: ProgramKey | 'all', pick: (c: OrgCard) => boolean) => {
    const sel = list.filter(pick);
    counts[key] = { orgs: sel.length, withContributors: sel.filter((c) => c.contributors > 0).length, contributors: new Set(sel.flatMap((c) => c.people)).size };
  };
  tally('all', () => true);
  for (const f of PROGRAM_FILTERS) tally(f.key, (c) => c.programs.includes(f.key));

  return { cards: list, counts, generatedAt: (input.now ?? new Date()).toISOString() };
}
