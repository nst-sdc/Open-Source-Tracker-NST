/**
 * lib/org-explorer-types.ts
 *
 * Client-safe part of the organisations explorer: the programme filters and
 * the card shape. app/organizations/OrgExplorer.tsx imports this; the
 * aggregation in lib/org-explorer.ts reaches the stores and must stay on
 * the server.
 */
export type ProgramKey = 'gsoc' | 'lfx' | 'cncf' | 'eclipse' | 'numfocus' | 'apache' | 'foundations' | 'sok' | 'sob' | 'lfdt' | 'outreachy' | 'esoc' | 'codeheat' | 'ospp' | 'vouched';

export const PROGRAM_FILTERS: ReadonlyArray<{ key: ProgramKey; label: string; hint: string }> = [
  { key: 'gsoc', label: 'GSoC', hint: 'Every Google Summer of Code organisation, 2016–2026, with its years, technologies and topics' },
  { key: 'lfx', label: 'LFX', hint: 'Linux Foundation mentorship projects' },
  { key: 'cncf', label: 'CNCF', hint: 'Cloud Native Computing Foundation landscape projects' },
  { key: 'eclipse', label: 'Eclipse', hint: 'Eclipse Foundation projects' },
  { key: 'numfocus', label: 'NumFOCUS', hint: 'NumFOCUS sponsored and affiliated projects' },
  { key: 'apache', label: 'Apache', hint: 'The Apache Software Foundation' },
  { key: 'foundations', label: 'Foundations', hint: 'Well-known foundations and flagship communities (PSF, VideoLAN, GNOME, KDE, Wikimedia …)' },
  { key: 'sok', label: 'Season of KDE', hint: 'KDE community mentorship (SoK): everything under github.com/KDE' },
  { key: 'sob', label: 'Summer of Bitcoin', hint: 'Bitcoin and Lightning projects that take Summer of Bitcoin interns' },
  { key: 'lfdt', label: 'LFDT', hint: 'LF Decentralized Trust (Hyperledger, Hiero) mentorships' },
  { key: 'outreachy', label: 'Outreachy', hint: 'Communities that regularly host Outreachy interns' },
  { key: 'esoc', label: 'ESoC', hint: 'ESoC organisations' },
  { key: 'codeheat', label: 'Codeheat', hint: 'FOSSASIA Codeheat' },
  { key: 'ospp', label: 'OSPP', hint: 'Open Source Promotion Plan communities' },
  { key: 'vouched', label: 'NST vouched', hint: 'Organisations an NST admin vouched for' },
];

export interface OrgCard {
  /** Login as GitHub spells it (from the index or the programme list). */
  login: string;
  name: string;
  description?: string;
  avatarUrl: string;
  url: string;
  /** Our students with at least one merged PR into this organisation. */
  contributors: number;
  /** Their merged PRs into it, in total. */
  mergedPRs: number;
  /** Up to three of them, most merged first. */
  top: Array<{ login: string; merged: number }>;
  /** All of them, lower-case, so the page can count distinct people across a selection. */
  people: string[];
  /** The repository we have merged into most here (owner/name), for the repo activity page. */
  topRepo?: { repo: string; merged: number };
  programs: ProgramKey[];
  tags: string[];
  /** GSoC years this organisation mentored in (from the programme lists and the GSoC dataset). */
  years?: number[];
  /** Key into the GSoC dataset (/api/gsoc-orgs) for technologies, topics, category and history. */
  gsocSlug?: string;
  /** GSoC projects per year across every dataset record of this organisation
   *  (an umbrella like Apache has several), for the flip back and the sheet. */
  gsocSlots?: Record<string, number>;
  /** No GitHub organisation: `login` is the dataset slug, `url` the project website. */
  site?: boolean;
  /** LFX Mentorship history of this organisation's repositories (data/lfx-orgs.json). */
  lfx?: LfxHistory;
  /** A GSoC umbrella: the slots are the organisation's, the work happens in
   *  member projects. `members` counts the member organisations seen in the
   *  projects' code links; `program` is the explorer filter that lists the
   *  whole membership, when there is one. */
  umbrella?: {
    /** Member organisations seen in the projects' code links. */
    members: number;
    /** Sub-organisations on the latest ideas list, and that list's year. */
    subOrgs: number;
    latestYear?: number;
    program?: ProgramKey;
  };
  /** A sub-organisation of one or more GSoC umbrellas: the umbrellas whose
   *  ideas lists named it and whose GSoC projects its code hosted. */
  via?: UmbrellaParent[];
}

export interface UmbrellaParent {
  /** The umbrella's dataset slug, name and GitHub login (none for GNU). */
  slug: string;
  name: string;
  login?: string;
  /** Years the umbrella's ideas list named this sub-organisation. */
  listed: number[];
  /** Years its code hosted the umbrella's GSoC projects, and how many. */
  years: number[];
  projects: number;
  projectsByYear: Record<string, number>;
  /** The member's repositories those projects were in, with project counts. */
  repos: Record<string, number>;
}

/** Mentorship history of one organisation in one programme: the years it took
 *  part and how many projects (slots) it ran each year. */
export interface ProgramHistory {
  years: number[];
  projects: number;
  projectsByYear: Record<string, number>;
}

export interface LfxHistory extends ProgramHistory {
  /** LFX parent organisation names (e.g. "Hyperledger Foundation"). */
  orgs: string[];
  logo: string | null;
  /** Skills the projects asked for, lower-case, most asked first. */
  skills: string[];
  /** Terms (1–3) the organisation ran projects in, per year. */
  termsByYear: Record<string, number[]>;
  /** Newest projects first. */
  recent: Array<{ name: string; year: number; term: number; repo: string; lfx: string | null }>;
}

export const LFX_FIRST_YEAR = 2019;
export const LFX_LAST_YEAR = 2026;

/** One organisation of the GSoC dataset (data/gsoc-orgs.json), 2016–2026. */
export interface GsocOrg {
  slug: string;
  name: string;
  github: string | null;
  category: string;
  description: string;
  url: string | null;
  image: string | null;
  years: number[];
  /** Lower-case, most used first. */
  technologies: string[];
  topics: string[];
  projects: number;
  projectsByYear: Record<string, number>;
  /** An umbrella organisation: GSoC counts its slots as one organisation, the
   *  work happens in sub-organisations. The detail is in data/gsoc-umbrellas.json. */
  umbrella?: boolean;
}

/** One sub-organisation as an umbrella's ideas list names it. */
export interface UmbrellaSubOrg {
  name: string;
  /** Its ideas page, as the umbrella links it. */
  url?: string;
  /** "owner" or "owner/repo" on GitHub, when the list links it or GitHub confirmed it. */
  github?: string;
}

/** data/gsoc-umbrellas.json: what an umbrella's ideas lists and its projects' code links say. */
export interface UmbrellaDetail {
  name: string;
  github: string | null;
  /** Sub-organisations per year from the umbrella's own ideas list. */
  subOrgsByYear: Record<string, UmbrellaSubOrg[]>;
  /** Member organisations per year, as the projects' code links name them, with how many projects each ran. */
  membersByYear: Record<string, Record<string, number>>;
  /** The repositories those projects were in, per member, with project counts. */
  memberRepos?: Record<string, Record<string, number>>;
}

export interface UmbrellaMember { login: string; projects: number; years: number[]; repos: Record<string, number> }

/** An umbrella's member organisations seen in project code links across every year, most projects first. */
export function umbrellaMembers(detail: Pick<UmbrellaDetail, 'membersByYear' | 'memberRepos'>): UmbrellaMember[] {
  const acc = new Map<string, UmbrellaMember>();
  for (const [year, counts] of Object.entries(detail.membersByYear ?? {})) {
    for (const [login, n] of Object.entries(counts)) {
      const key = login.toLowerCase();
      const m = acc.get(key) ?? { login, projects: 0, years: [], repos: detail.memberRepos?.[login] ?? {} };
      m.projects += n;
      m.years.push(Number(year));
      acc.set(key, m);
    }
  }
  return [...acc.values()].map((m) => ({ ...m, years: [...new Set(m.years)].sort((a, b) => a - b) })).sort((a, b) => b.projects - a.projects || a.login.localeCompare(b.login));
}

export const GSOC_FIRST_YEAR = 2016;
export const GSOC_LAST_YEAR = 2026;

/** The organisation's page on the official GSoC site for a year: the archive
 *  for past programmes, the programme pages for the current one. */
export function gsocOfficialOrgUrl(slug: string, year: number): string {
  const base = year >= GSOC_LAST_YEAR ? `programs/${year}` : `archive/${year}`;
  return `https://summerofcode.withgoogle.com/${base}/organizations/${encodeURIComponent(slug)}`;
}

/** One past GSoC project of an organisation, from the official site. */
export interface GsocProject {
  title: string;
  /** The project's page on summerofcode.withgoogle.com. */
  url: string;
  contributor?: string;
  mentors?: string[];
  summary?: string;
  /** Where the code or the final report lives, when the contributor gave one. */
  codeUrl?: string;
  /** The GitHub organisation or account that link points into: under an umbrella, the member project. */
  codeOwner?: string;
  tech?: string[];
}

/** Open issues labelled for newcomers across the organisation, on GitHub. */
export function goodFirstIssuesUrl(login: string): string {
  return `https://github.com/search?q=${encodeURIComponent(`org:${login} label:"good first issue" state:open`)}&type=issues&s=created&o=desc`;
}

export interface OrgExplorerData {
  cards: OrgCard[];
  /** Organisations, and distinct contributors, per programme filter, for the chips. */
  counts: Record<ProgramKey | 'all', { orgs: number; withContributors: number; contributors: number }>;
  generatedAt: string;
}

