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
