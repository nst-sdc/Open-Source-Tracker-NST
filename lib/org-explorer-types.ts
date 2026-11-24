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
  /** No GitHub organisation: `login` is the dataset slug, `url` the project website. */
  site?: boolean;
  /** LFX Mentorship history of this organisation's repositories (data/lfx-orgs.json). */
  lfx?: LfxHistory;
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

