/**
 * Application-cycle schedules for the open source programs listed on /programs.
 *
 * Every program on that page repeats on an annual calendar, so a cycle is stored
 * as a recurring month/day window rather than a fixed date — that way the data
 * does not go stale the moment a year rolls over. Windows are approximate (the
 * programs page already carries that disclaimer); they are meant to answer
 * "roughly how long until I can apply again", not to replace the official dates.
 *
 * All arithmetic is done in UTC so the server and the browser agree on which
 * cycle comes next regardless of the visitor's timezone.
 */

/** A day in the annual calendar, e.g. `{ month: 3, day: 24 }` for 24 March. */
export interface CycleDay {
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
}

export interface ProgramCycle {
  /** Short name for the term, e.g. 'Spring term' or 'Contributor applications'. */
  label: string;
  /** Day applications open. */
  opens: CycleDay;
  /** Day applications close. A window that ends before it starts wraps the year. */
  closes: CycleDay;
}

export interface ProgramSchedule {
  /** Recurring application windows. Empty when the program accepts applications year-round. */
  cycles: ProgramCycle[];
  /** True for programs with no cycle at all (rolling applications). */
  rolling?: boolean;
}

/** The resolved cycle a visitor cares about right now. */
export interface NextCycle {
  label: string;
  /** Epoch ms when the window opens. */
  opensAt: number;
  /** Epoch ms when the window closes. */
  closesAt: number;
  /** True when `now` falls inside the window — the countdown then runs to `closesAt`. */
  isOpen: boolean;
}

const DAY_MS = 86_400_000;

function utc(year: number, { month, day }: CycleDay): number {
  return Date.UTC(year, month - 1, day);
}

/**
 * Expand one recurring window into the concrete occurrences around `now`.
 *
 * Windows are anchored on the year they open in, and the previous/current/next
 * three years are enough to cover a window that wraps from December into
 * February whichever side of new year `now` happens to fall.
 */
function occurrences(cycle: ProgramCycle, now: number): { opensAt: number; closesAt: number }[] {
  const year = new Date(now).getUTCFullYear();

  return [year - 1, year, year + 1].map((y) => {
    const opensAt = utc(y, cycle.opens);
    let closesAt = utc(y, cycle.closes);
    // A close date at or before the open date belongs to the following year.
    if (closesAt <= opensAt) closesAt = utc(y + 1, cycle.closes);
    // Windows are inclusive of their closing day.
    return { opensAt, closesAt: closesAt + DAY_MS - 1 };
  });
}

/**
 * The cycle to show for a program: the one that is open right now, or failing
 * that the next one to open. Returns null for rolling / unscheduled programs.
 */
export function resolveNextCycle(schedule: ProgramSchedule, now: number): NextCycle | null {
  if (schedule.rolling || schedule.cycles.length === 0) return null;

  const all = schedule.cycles.flatMap((cycle) =>
    occurrences(cycle, now).map((o) => ({ ...o, label: cycle.label })),
  );

  const open = all
    .filter((o) => now >= o.opensAt && now <= o.closesAt)
    .sort((a, b) => a.closesAt - b.closesAt)[0];

  if (open) {
    return { label: open.label, opensAt: open.opensAt, closesAt: open.closesAt, isOpen: true };
  }

  const upcoming = all
    .filter((o) => o.opensAt > now)
    .sort((a, b) => a.opensAt - b.opensAt)[0];

  if (!upcoming) return null;

  return {
    label: upcoming.label,
    opensAt: upcoming.opensAt,
    closesAt: upcoming.closesAt,
    isOpen: false,
  };
}

/** Time left until `target`, split into whole units. Null once the moment has passed. */
export function breakdown(target: number, now: number) {
  const diff = target - now;
  if (diff <= 0) return null;

  return {
    diff,
    days: Math.floor(diff / DAY_MS),
    hours: Math.floor((diff % DAY_MS) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * e.g. '24 Mar' — the year is only worth showing when it is not the current one.
 * Formatted by hand rather than via `toLocaleDateString` so the wording does not
 * shift with the runtime's locale data.
 */
export function formatCycleDate(epochMs: number, now: number): string {
  const date = new Date(epochMs);
  const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  const year = date.getUTCFullYear();

  return year === new Date(now).getUTCFullYear() ? day : `${day} ${year}`;
}

/** e.g. '24 Mar – 8 Apr 2027' — a year shared by both ends is only printed once. */
export function formatCycleRange(opensAt: number, closesAt: number, now: number): string {
  const opens = new Date(opensAt);
  const closes = new Date(closesAt);
  const from =
    opens.getUTCFullYear() === closes.getUTCFullYear()
      ? // The year, if any, is printed once — on the closing date.
        `${opens.getUTCDate()} ${MONTHS[opens.getUTCMonth()]}`
      : formatCycleDate(opensAt, now);

  return `${from} – ${formatCycleDate(closesAt, now)}`;
}

/**
 * Application windows per program, keyed by the ids in app/programs/page.tsx.
 * From each program's 2026 timeline; verify on the official site before relying on a date.
 */
export const PROGRAM_SCHEDULES: Record<string, ProgramSchedule> = {
  gsoc: {
    cycles: [
      { label: 'Contributor applications', opens: { month: 3, day: 16 }, closes: { month: 3, day: 31 } },
    ],
  },
  lfx: {
    cycles: [
      { label: 'Spring term', opens: { month: 1, day: 26 }, closes: { month: 2, day: 10 } },
      { label: 'Summer term', opens: { month: 5, day: 5 }, closes: { month: 5, day: 19 } },
      { label: 'Fall term', opens: { month: 8, day: 3 }, closes: { month: 8, day: 18 } },
    ],
  },
  outreachy: {
    cycles: [
      { label: 'May–August cohort', opens: { month: 2, day: 6 }, closes: { month: 2, day: 13 } },
      { label: 'December–March cohort', opens: { month: 8, day: 24 }, closes: { month: 8, day: 31 } },
    ],
  },
  'summer-of-bitcoin': {
    cycles: [
      { label: 'Student applications', opens: { month: 1, day: 15 }, closes: { month: 2, day: 15 } },
    ],
  },
  lfdt: {
    cycles: [
      { label: 'Mentee applications', opens: { month: 3, day: 31 }, closes: { month: 5, day: 11 } },
    ],
  },
  ospp: {
    cycles: [
      { label: 'Student registration', opens: { month: 4, day: 29 }, closes: { month: 6, day: 16 } },
    ],
  },
  gssoc: {
    cycles: [
      { label: 'Contributor applications', opens: { month: 1, day: 20 }, closes: { month: 3, day: 31 } },
    ],
  },
  sok: {
    cycles: [
      { label: 'Season of KDE applications', opens: { month: 12, day: 1 }, closes: { month: 1, day: 14 } },
    ],
  },
  codeheat: {
    cycles: [
      { label: 'Contest period', opens: { month: 9, day: 1 }, closes: { month: 2, day: 28 } },
    ],
  },
  hacktoberfest: {
    cycles: [
      { label: 'Hacktoberfest', opens: { month: 10, day: 1 }, closes: { month: 10, day: 31 } },
    ],
  },
};
