/**
 * lib/deadlines.ts
 *
 * Upcoming programme dates for the postcard pinned to every page: what is
 * published, what is only expected from past years, and the words that
 * explain each programme when the postcard is hovered. Dates are UTC; a date
 * without a time counts until the end of that day.
 */

export type DeadlineKind = 'published' | 'expected';

export interface Milestone {
  /** What happens, e.g. "applications close". */
  label: string;
  /** ISO date or date-time, UTC. */
  at: string;
  /** Milestones that are an estimate from last year's pattern. */
  estimated?: boolean;
}

export interface Deadline {
  id: string;
  program: string;
  /** Short name for the postcard. */
  short: string;
  /** Even shorter, for the stamp that peeks out at rest (defaults to "left"). */
  stamp?: string;
  kind: DeadlineKind;
  milestones: Milestone[];
  /** Plain-language explanation shown on hover. */
  about: string;
  /** Facts worth knowing before applying. */
  facts: string[];
  /** Where the dates come from and how sure they are. */
  source: string;
  url: string;
  /** The tracker's own page for the programme, when it has one. */
  more?: string;
  /** Kept in the file but off the postcard for now. */
  hidden?: boolean;
}

export const DEADLINES: ReadonlyArray<Deadline> = [
  {
    id: 'mlh-spring-2027',
    program: 'MLH Fellowship, Spring 2027',
    short: 'MLH Fellowship',
    kind: 'published',
    hidden: true,
    milestones: [
      { label: 'applications close', at: '2027-01-04' },
      { label: 'batch starts', at: '2027-01-25' },
      { label: 'batch ends', at: '2027-04-16' },
    ],
    about: 'A 12-week remote programme where fellows work in small pods on open source projects with a mentor, part time, alongside studies.',
    facts: ['Runs 25 January to 16 April 2027.', 'Monday, Wednesday and Friday, about 20 hours a week.', 'Only the Software Engineering track is listed for Spring 2027.'],
    source: 'Dates quoted from MLH’s application form by a third-party site. Confirm on fellowship.mlh.io before planning around them.',
    url: 'https://fellowship.mlh.io/',
    more: '/programs',
  },
  {
    id: 'lfx-spring-2027',
    program: 'LFX Mentorship, Spring 2027',
    short: 'LFX Mentorship',
    stamp: 'LFX',
    kind: 'published',
    milestones: [
      { label: 'RISC-V programmes notified', at: '2026-12-04' },
      { label: 'RISC-V mentorships listed', at: '2027-01-07' },
      { label: 'CNCF applications expected to open', at: '2027-01-26', estimated: true },
      { label: 'CNCF applications expected to close', at: '2027-02-10', estimated: true },
      { label: 'spring term starts', at: '2027-03-01' },
      { label: 'spring term ends', at: '2027-05-31' },
    ],
    about: 'The Linux Foundation’s paid, remote mentorship platform. Projects under CNCF, RISC-V, Hyperledger, OpenSSF and other foundations post mentorships each term; a mentee works with a maintainer for twelve weeks.',
    facts: ['Three terms a year: spring (March to May), summer (June to August) and fall (September to November).', 'Each foundation sets its own application window. RISC-V lists its Spring 2027 mentorships on 7 January; CNCF Term 1 applications were open 26 January to 10 February in 2026.', 'Apply on mentorship.lfx.linuxfoundation.org once a mentorship is listed.'],
    source: 'Term dates and the RISC-V schedule are published; the CNCF window is estimated from 2026.',
    url: 'https://mentorship.lfx.linuxfoundation.org/',
    more: '/organizations?program=lfx',
  },
  {
    id: 'gsoc-2027',
    program: 'Google Summer of Code 2027',
    short: 'GSoC 2027',
    kind: 'expected',
    hidden: true,
    milestones: [
      { label: 'announcement expected', at: '2027-01-15', estimated: true },
      { label: 'organisation applications expected to open', at: '2027-01-19', estimated: true },
      { label: 'contributor applications expected to open', at: '2027-03-16', estimated: true },
      { label: 'contributor applications expected to close', at: '2027-03-31', estimated: true },
    ],
    about: 'Google’s 12-week-plus programme pairing new contributors with open source organisations on a paid project. The best-known entry point into open source.',
    facts: ['The official timeline page still shows 2026.', 'In 2026, organisations applied 19 January to 3 February and contributors 16 to 31 March.', 'Expect 2027 to follow the same pattern, announced around December or January.'],
    source: 'Estimated from the 2026 timeline; nothing for 2027 is published yet.',
    url: 'https://summerofcode.withgoogle.com/',
    more: '/organizations?program=gsoc',
  },
  {
    id: 'outreachy-may-2027',
    program: 'Outreachy, May 2027 round',
    short: 'Outreachy',
    kind: 'expected',
    hidden: true,
    milestones: [
      { label: 'December 2026 interns announced', at: '2026-11-30' },
      { label: 'December 2026 internship starts', at: '2026-12-07' },
      { label: 'May 2027 applications expected to open', at: '2027-02-06', estimated: true },
      { label: 'May 2027 applications expected to close', at: '2027-02-13', estimated: true },
    ],
    about: 'Paid, remote three-month internships in open source for people underrepresented in tech, with two rounds a year and a contribution period before selection.',
    facts: ['The December 2026 round is closed; it runs 7 December 2026 to 8 March 2027.', 'In 2026 the May-round initial application window was 6 to 13 February, one week only.', 'Stipend US$7,000 for the internship.'],
    source: 'December round dates published by Outreachy; May 2027 window estimated from 2026.',
    url: 'https://www.outreachy.org/apply/',
    more: '/organizations?program=outreachy',
  },
];

/** End of the day for a bare date, the instant itself for a date-time. */
export function milestoneTime(at: string): number {
  return /T/.test(at) ? Date.parse(at) : Date.parse(`${at}T23:59:59Z`);
}

/** The first milestone still ahead of `now`, or the last one when all have passed. */
export function nextMilestone(d: Deadline, now: number): Milestone | null {
  const ahead = d.milestones.filter((m) => milestoneTime(m.at) > now).sort((a, b) => milestoneTime(a.at) - milestoneTime(b.at));
  return ahead[0] ?? null;
}

export interface Countdown { days: number; hours: number; minutes: number; totalMs: number }

export function countdown(target: number, now: number): Countdown {
  const totalMs = Math.max(0, target - now);
  const days = Math.floor(totalMs / 86_400_000);
  const hours = Math.floor((totalMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  return { days, hours, minutes, totalMs };
}

/** "41d 06h", "3h 12m", "12m", "now". */
export function formatCountdown(c: Countdown): string {
  if (c.totalMs <= 0) return 'now';
  if (c.days > 0) return `${c.days}d ${String(c.hours).padStart(2, '0')}h`;
  if (c.hours > 0) return `${c.hours}h ${String(c.minutes).padStart(2, '0')}m`;
  return `${Math.max(1, c.minutes)}m`;
}

/** "4 Jan 2027" in UTC. */
export function formatDate(at: string): string {
  return new Date(milestoneTime(at)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Deadlines on the postcard with something still ahead, soonest next milestone first. */
export function upcoming(list: ReadonlyArray<Deadline>, now: number): Array<{ deadline: Deadline; next: Milestone }> {
  return list
    .filter((d) => !d.hidden)
    .map((deadline) => ({ deadline, next: nextMilestone(deadline, now) }))
    .filter((x): x is { deadline: Deadline; next: Milestone } => x.next !== null)
    .sort((a, b) => milestoneTime(a.next.at) - milestoneTime(b.next.at));
}
