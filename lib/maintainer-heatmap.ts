/**
 * lib/maintainer-heatmap.ts
 *
 * When are a repository's maintainers active? A GitHub-style calendar of the
 * days on which a maintainer merged or raised a pull request, so a student
 * can see whether reviews happen on weekdays or weekends, and which days,
 * before deciding when to ping. Pure: the API ships the events, the browser
 * buckets them in the viewer's own time zone.
 */

export type MaintainerEventKind = 'merged' | 'raised';

export interface MaintainerEvent {
  /** ISO timestamp of the merge or of the PR being opened. */
  t: string;
  /** Maintainer login. */
  who: string;
  kind: MaintainerEventKind;
  /** PR number. */
  n: number;
  title: string;
  /** For a merge: who wrote the PR (absent when GitHub no longer knows). */
  by?: string;
}

export interface HeatPerson {
  login: string;
  merged: number;
  raised: number;
  prs: Array<{ n: number; kind: MaintainerEventKind; title: string; by?: string }>;
}

export interface HeatDay {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  merged: number;
  raised: number;
  people: HeatPerson[];
}

export interface Heatmap {
  /** Columns, oldest week first; each has seven slots Monday → Sunday, null outside the window. */
  weeks: Array<Array<HeatDay | null>>;
  /** Activity per weekday, Monday first. */
  weekdayTotals: number[];
  total: number;
  /** Share of all activity that fell on Saturday or Sunday, 0..1. */
  weekendShare: number;
  /** Weekday indexes (Monday = 0) carrying the most activity; empty when there is none. */
  busiest: number[];
  /** Most events on any single day. */
  maxDay: number;
  /** Distinct maintainers seen. */
  people: number;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day of a Date. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Monday-first weekday of a Date. */
export const mondayFirst = (d: Date) => (d.getDay() + 6) % 7;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** 0 for an empty day, else 1..4 relative to the busiest day. */
export function heatLevel(count: number, maxDay: number): number {
  if (count <= 0 || maxDay <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((count / maxDay) * 4)));
}

export function buildHeatmap(events: readonly MaintainerEvent[], since: Date, until: Date): Heatmap {
  const byDay = new Map<string, HeatDay>();
  const logins = new Set<string>();
  for (const e of events) {
    const d = new Date(e.t);
    if (Number.isNaN(d.getTime()) || d < since || d > until) continue;
    const key = dayKey(d);
    const day = byDay.get(key) ?? { date: key, weekday: mondayFirst(d), merged: 0, raised: 0, people: [] };
    byDay.set(key, day);
    day[e.kind]++;
    const lower = e.who.toLowerCase();
    logins.add(lower);
    let p = day.people.find((x) => x.login.toLowerCase() === lower);
    if (!p) {
      p = { login: e.who, merged: 0, raised: 0, prs: [] };
      day.people.push(p);
    }
    p[e.kind]++;
    p.prs.push({ n: e.n, kind: e.kind, title: e.title, ...(e.by ? { by: e.by } : {}) });
  }
  for (const day of byDay.values()) day.people.sort((a, b) => b.merged + b.raised - (a.merged + a.raised));

  // The grid runs from the Monday on or before `since` to `until`, one column
  // per week, so weekends line up as the two bottom rows.
  const first = startOfDay(since);
  first.setDate(first.getDate() - mondayFirst(first));
  const last = startOfDay(until);
  const weeks: Array<Array<HeatDay | null>> = [];
  const sinceDay = startOfDay(since);
  for (let cursor = new Date(first); cursor <= last; cursor.setDate(cursor.getDate() + 7)) {
    const week: Array<HeatDay | null> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(d.getDate() + i);
      if (d < sinceDay || d > last) {
        week.push(null);
        continue;
      }
      const key = dayKey(d);
      week.push(byDay.get(key) ?? { date: key, weekday: i, merged: 0, raised: 0, people: [] });
    }
    weeks.push(week);
  }

  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  let maxDay = 0;
  for (const day of byDay.values()) {
    const c = day.merged + day.raised;
    weekdayTotals[day.weekday] += c;
    total += c;
    if (c > maxDay) maxDay = c;
  }
  const top = Math.max(...weekdayTotals);
  const busiest = top > 0 ? weekdayTotals.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0) : [];
  const weekendShare = total > 0 ? (weekdayTotals[5] + weekdayTotals[6]) / total : 0;
  return { weeks, weekdayTotals, total, weekendShare, busiest, maxDay, people: logins.size };
}
