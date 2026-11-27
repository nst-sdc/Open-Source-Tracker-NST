/**
 * lib/kv-closed-prs.ts — storage for the closed-PR review.
 *
 * `closed_pr_feedback`: a hash of repo#number -> ClosedPrFeedback, so a
 * scan adds rows one at a time (atomically) and can resume. `student_donts`:
 * the admin-curated, anonymised quotes shown on /get-started.
 */
import { kvGet, kvSet } from './kv';
import { hashEntries, runCommands } from './kv-commands';
import type { ClosedPrFeedback, Dont } from './closed-pr-review';

export const FEEDBACK_KEY = 'closed_pr_feedback';
export const DONTS_KEY = 'student_donts';
export const SCAN_CURSOR_KEY = 'closed_pr_scan_cursor';

export async function getClosedPrFeedback(): Promise<ClosedPrFeedback[]> {
  const { ok, results } = await runCommands([['HGETALL', FEEDBACK_KEY]]);
  if (!ok) return [];
  const out: ClosedPrFeedback[] = [];
  for (const v of Object.values(hashEntries(results[0]))) {
    try { out.push(JSON.parse(v) as ClosedPrFeedback); } catch { /* skip a bad row */ }
  }
  return out;
}

export async function knownFeedbackKeys(): Promise<Set<string>> {
  const { ok, results } = await runCommands([['HKEYS', FEEDBACK_KEY]]);
  if (!ok) return new Set();
  const r = results[0];
  return new Set(Array.isArray(r) ? r.map(String) : []);
}

export async function putClosedPrFeedback(rows: ClosedPrFeedback[]): Promise<boolean> {
  if (rows.length === 0) return true;
  const { ok } = await runCommands([['HSET', FEEDBACK_KEY, ...rows.flatMap((r) => [r.key, JSON.stringify(r)])]]);
  return ok;
}

export async function getDonts(): Promise<Dont[]> {
  const list = await kvGet<Dont[]>(DONTS_KEY);
  return Array.isArray(list) ? list : [];
}

export async function addDont(d: Omit<Dont, 'id' | 'addedAt'>, nowIso = new Date().toISOString()): Promise<Dont> {
  const list = await getDonts();
  const dont: Dont = { ...d, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, addedAt: nowIso };
  list.push(dont);
  await kvSet(DONTS_KEY, list);
  return dont;
}

export async function removeDont(id: string): Promise<boolean> {
  const list = await getDonts();
  const kept = list.filter((d) => d.id !== id);
  if (kept.length === list.length) return false;
  return kvSet(DONTS_KEY, kept);
}
