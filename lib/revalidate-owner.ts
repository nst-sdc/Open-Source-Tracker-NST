/**
 * Re-decides the validity gate for every cached repo under one owner. Run
 * after an admin vouches for (or un-vouches) an organisation, so the change
 * reaches scoring now rather than when each repo next ages out of the cache.
 */
import { getRepoCache, saveRepoCache, buildOrgPriors } from './repo-cache';
import { isRepoValid } from './repo-score';
import { primeVouchedOrgs } from './kv-vouched-orgs';
import { invalidateSummaryCache } from './summary-cache';

export async function revalidateOwnerRepos(owner: string): Promise<{ repos: number; changed: number; nowValid: number }> {
  await primeVouchedOrgs(true);
  const map = await getRepoCache();
  const priorFor = buildOrgPriors(map);
  const lower = owner.toLowerCase();
  let repos = 0;
  let changed = 0;
  let nowValid = 0;
  for (const [name, entry] of Object.entries(map)) {
    if (name.split('/')[0]?.toLowerCase() !== lower || !entry.signals) continue;
    repos++;
    const valid = isRepoValid(entry.signals, priorFor(name));
    if (valid) nowValid++;
    if (valid !== entry.valid) {
      entry.valid = valid;
      changed++;
    }
  }
  if (changed > 0) {
    await saveRepoCache(map);
    // Summaries carry the old decision; mark every period stale so the next
    // page view rebuilds them with the new one.
    await invalidateSummaryCache();
  }
  return { repos, changed, nowValid };
}
