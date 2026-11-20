/**
 * Re-decides the validity gate for every cached repo under one owner. Run
 * after an admin vouches for (or un-vouches) an organisation, so the change
 * reaches scoring now rather than when each repo next ages out of the cache.
 */
import { reclassifyRepos } from './reclassify';

export async function revalidateOwnerRepos(owner: string): Promise<{ repos: number; changed: number; nowValid: number }> {
  const lower = owner.toLowerCase();
  const r = await reclassifyRepos((name) => name.split('/')[0]?.toLowerCase() === lower);
  return { repos: r.repos, changed: r.changed, nowValid: r.nowValid };
}

/** Re-decides the gate for every cached repo under any of these owners in one
 *  pass. Used when the refresh tick classifies owners, so the star bar their
 *  repos were judged against is the right one from then on. */
export async function revalidateOwnersRepos(owners: string[]): Promise<{ repos: number; changed: number; nowValid: number }> {
  const set = new Set(owners.map((o) => o.toLowerCase()));
  if (set.size === 0) return { repos: 0, changed: 0, nowValid: 0 };
  const r = await reclassifyRepos((name) => set.has(name.split('/')[0]?.toLowerCase() ?? ''));
  return { repos: r.repos, changed: r.changed, nowValid: r.nowValid };
}
