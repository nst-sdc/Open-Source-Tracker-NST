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
  { key: 'gsoc', label: 'GSoC', hint: 'Google Summer of Code organisations, 2016–2021 and 2025–2026' },
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
}

export interface OrgExplorerData {
  cards: OrgCard[];
  /** Organisations, and distinct contributors, per programme filter, for the chips. */
  counts: Record<ProgramKey | 'all', { orgs: number; withContributors: number; contributors: number }>;
  generatedAt: string;
}

