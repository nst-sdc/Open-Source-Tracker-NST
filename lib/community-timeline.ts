/**
 * lib/community-timeline.ts
 *
 * The whole community's activity by month: pull requests opened, pull
 * requests merged, issues opened, and how many students had a merge. One
 * precomputed record, so the contributors page and the home page can draw
 * it without opening 2,300 profile caches per view. Rebuilt by the refresh
 * tick every REBUILD_EVERY_MS (and on demand from the admin API), with the
 * same exclusion rule as the leaderboard, so the two never disagree.
 *
 * Stored per (campus, year) segment. A student belongs to exactly one
 * segment, so any campus/year filter is a plain sum over matching segments,
 * distinct-contributor counts included.
 */
import { kvGet, kvSet } from './kv';
import { readProfileCache, type ProfileCacheEntry } from './profile-cache';
import type { Student } from './kv-students';

export const KV_KEY = 'community_timeline';
export const REBUILD_EVERY_MS = 6 * 60 * 60 * 1000;
export const MONTHS_KEPT = 24;

export interface Counts {
  opened: number;
  merged: number;
  issues: number;
  /** Students with at least one merged PR that month. */
  contributors: number;
}

export interface MonthBucket extends Counts {
  /** 'YYYY-MM', UTC. */
  month: string;
  /** True for the month that is still running. */
  partial: boolean;
}

export interface CommunityTimeline {
  builtAt: string;
  /** month → segment ('campus|year', '-' for unknown) → counts */
  months: Record<string, Record<string, Counts>>;
  studentsCounted: number;
}

export interface TimelineFilters {
  flaggedPRIds?: Set<string>;
  /** The leaderboard's own rule; see lib/incremental-refresh.ts. */
  excludesPR?: (repoFullName: string, mergedAt: string | null | undefined) => boolean;
}

export const monthOf = (iso: string): string => iso.slice(0, 7);

export function segmentKey(s: Pick<Student, 'campus' | 'year'>): string {
  return `${s.campus ?? '-'}|${s.year ?? '-'}`;
}

export function segmentMatches(key: string, f: { campus?: string; year?: string }): boolean {
  const [campus, year] = key.split('|');
  if (f.campus && campus !== f.campus) return false;
  if (f.year && year !== f.year) return false;
  return true;
}

/** Last N month keys ending at `nowMs`'s month, oldest first. Pure. */
export function lastMonths(n: number, nowMs = Date.now()): string[] {
  const d = new Date(nowMs);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m + 1).padStart(2, '0')}`);
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return out;
}

const repoOf = (url: string | undefined) => (url ?? '').replace('https://api.github.com/repos/', '');

/**
 * Folds one student's cached PRs and issues into `months`. Pure apart from
 * mutating `months`; exported for tests and the rebuild.
 */
export function foldStudent(
  months: CommunityTimeline['months'],
  student: Pick<Student, 'github' | 'campus' | 'year'>,
  profile: Pick<ProfileCacheEntry, 'prs' | 'issues'>,
  filters: TimelineFilters,
  keepMonths: Set<string>,
): void {
  const seg = segmentKey(student);
  const bump = (month: string, field: keyof Counts, by = 1) => {
    if (!keepMonths.has(month)) return;
    const row = (months[month] ??= {});
    const c = (row[seg] ??= { opened: 0, merged: 0, issues: 0, contributors: 0 });
    c[field] += by;
  };
  const mergedMonths = new Set<string>();
  for (const pr of profile.prs ?? []) {
    const repo = repoOf(pr.repository_url);
    const mergedAt = pr.pull_request?.merged_at ?? null;
    if (filters.flaggedPRIds?.has(`${repo}#${pr.number}`)) continue;
    if (filters.excludesPR?.(repo, mergedAt)) continue;
    if (pr.created_at) bump(monthOf(pr.created_at), 'opened');
    if (mergedAt) {
      const m = monthOf(mergedAt);
      bump(m, 'merged');
      if (keepMonths.has(m)) mergedMonths.add(m);
    }
  }
  for (const is of profile.issues ?? []) if (is.created_at) bump(monthOf(is.created_at), 'issues');
  for (const m of mergedMonths) bump(m, 'contributors');
}

export async function buildCommunityTimeline(
  students: Student[],
  filtersFor: TimelineFilters | ((s: Student) => TimelineFilters),
  readProfile: (login: string) => Promise<Pick<ProfileCacheEntry, 'prs' | 'issues'> | null> = readProfileCache,
  nowMs = Date.now(),
): Promise<CommunityTimeline> {
  const keep = new Set(lastMonths(MONTHS_KEPT, nowMs));
  const months: CommunityTimeline['months'] = {};
  let counted = 0;
  const BATCH = 50;
  for (let i = 0; i < students.length; i += BATCH) {
    const batch = students.slice(i, i + BATCH);
    const profiles = await Promise.all(
      batch.map(async (s) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            return await readProfile(s.github);
          } catch {
            /* retry once */
          }
        }
        return null;
      }),
    );
    profiles.forEach((p, j) => {
      if (!p) return;
      counted++;
      foldStudent(months, batch[j], p, typeof filtersFor === 'function' ? filtersFor(batch[j]) : filtersFor, keep);
    });
  }
  return { builtAt: new Date(nowMs).toISOString(), months, studentsCounted: counted };
}

export async function readCommunityTimeline(): Promise<CommunityTimeline | null> {
  const t = await kvGet<CommunityTimeline>(KV_KEY);
  return t && typeof t === 'object' && t.months ? t : null;
}

export async function writeCommunityTimeline(t: CommunityTimeline): Promise<boolean> {
  return kvSet(KV_KEY, t);
}

export function timelineIsStale(t: CommunityTimeline | null, nowMs = Date.now(), maxAgeMs = REBUILD_EVERY_MS): boolean {
  if (!t) return true;
  const at = Date.parse(t.builtAt);
  return !Number.isFinite(at) || nowMs - at > maxAgeMs;
}

/** The series a chart draws: last `n` months, zero-filled, filtered by campus/year. Pure. */
export function seriesFor(
  t: CommunityTimeline | null,
  filters: { campus?: string; year?: string } = {},
  n = 12,
  nowMs = Date.now(),
): MonthBucket[] {
  const keys = lastMonths(n, nowMs);
  const current = keys[keys.length - 1];
  return keys.map((month) => {
    const acc: Counts = { opened: 0, merged: 0, issues: 0, contributors: 0 };
    for (const [seg, c] of Object.entries(t?.months[month] ?? {})) {
      if (!segmentMatches(seg, filters)) continue;
      acc.opened += c.opened;
      acc.merged += c.merged;
      acc.issues += c.issues;
      acc.contributors += c.contributors;
    }
    return { month, partial: month === current, ...acc };
  });
}
