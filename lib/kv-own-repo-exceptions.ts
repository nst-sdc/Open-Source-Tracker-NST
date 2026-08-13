/**
 * lib/kv-own-repo-exceptions.ts
 *
 * Admin-curated allowlist of a student's own repos whose self-authored PRs
 * should count toward their score. By default, PRs a student opens against
 * their own repos are excluded entirely (see the `-user:X` search filter in
 * lib/github.ts) — that's what stops the trivial "make a repo, merge your
 * own PRs into it" gaming vector.
 *
 * This list is the one exception: a student who's built a genuinely used
 * open source project can ask an admin to review it, and the admin adds it
 * here. Deliberately NOT gated on an automated metric like star/fork counts
 * — in a small, socially-connected student community, coordinating friends
 * to star+fork a throwaway repo is trivial and undetectable. A human
 * actually looking at the project is the only check that can't be gamed
 * this way.
 */

import { kvGet, kvSet } from './kv';

const KV_KEY = 'own_repo_exceptions';

export interface OwnRepoException {
  /** GitHub username of the student */
  username: string;
  /** "owner/repo" — owner should equal username, but stored explicitly for clarity/display */
  repo: string;
  /** ISO timestamp when the admin added this exception */
  addedAt: string;
  /** Optional note on why this was approved */
  note?: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export async function getOwnRepoExceptions(): Promise<OwnRepoException[]> {
  return (await kvGet<OwnRepoException[]>(KV_KEY)) || [];
}

async function saveOwnRepoExceptions(list: OwnRepoException[]): Promise<void> {
  await kvSet(KV_KEY, list);
}

/** All exception repos for one student, lowercased for case-insensitive matching. */
export async function getExceptionRepoSetForUser(username: string): Promise<Set<string>> {
  const list = await getOwnRepoExceptions();
  const lowerUsername = normalize(username);
  return new Set(
    list.filter((e) => normalize(e.username) === lowerUsername).map((e) => normalize(e.repo))
  );
}

export async function addOwnRepoException(entry: Omit<OwnRepoException, 'addedAt'>): Promise<void> {
  const list = (await getOwnRepoExceptions()).filter(
    (e) => !(normalize(e.username) === normalize(entry.username) && normalize(e.repo) === normalize(entry.repo))
  );
  list.push({ ...entry, addedAt: new Date().toISOString() });
  await saveOwnRepoExceptions(list);
}

export async function removeOwnRepoException(username: string, repo: string): Promise<boolean> {
  const before = await getOwnRepoExceptions();
  const after = before.filter(
    (e) => !(normalize(e.username) === normalize(username) && normalize(e.repo) === normalize(repo))
  );
  if (after.length === before.length) return false;
  await saveOwnRepoExceptions(after);
  return true;
}

/**
 * Groups the flat exceptions list into a per-user lookup, for callers that
 * compute summaries across many students at once — fetch the (small) full
 * list once, build this map once, then look up per student synchronously
 * instead of doing one KV read per student.
 */
export function buildOwnRepoExceptionMap(list: OwnRepoException[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of list) {
    const key = normalize(e.username);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(normalize(e.repo));
  }
  return map;
}

export const EMPTY_REPO_SET: Set<string> = new Set();
