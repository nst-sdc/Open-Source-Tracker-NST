/**
 * Re-runs the gate over every cached repository with the current rules,
 * org priors, vouched orgs and roster. Used after an admin edits the rules
 * or vouches for an organisation, and once right after this ships, so the
 * public numbers follow the rules rather than wait for each repo to age
 * out of the cache. Admin manual overrides are left alone.
 */
import { getRepoCache, saveRepoCache, buildOrgPriors } from './repo-cache';
import { gateDecision } from './repo-score';
import { buildGateContext } from './gate-rules';
import { primeVouchedOrgs } from './kv-vouched-orgs';
import { invalidateSummaryCache } from './summary-cache';

export interface ReclassifyResult {
  repos: number;
  changed: number;
  nowValid: number;
  byReason: Record<string, number>;
}

export async function reclassifyRepos(filter?: (repoFullName: string) => boolean): Promise<ReclassifyResult> {
  await primeVouchedOrgs(true);
  const [map, ctx] = await Promise.all([getRepoCache(), buildGateContext(true)]);
  const priorFor = buildOrgPriors(map);
  let repos = 0;
  let changed = 0;
  let nowValid = 0;
  const byReason: Record<string, number> = {};
  for (const [name, entry] of Object.entries(map)) {
    if (!entry.signals || entry.manualOverride) continue;
    if (filter && !filter(name)) continue;
    repos++;
    const d = gateDecision(entry.signals, priorFor(name), ctx, name);
    if (d.valid) nowValid++;
    else byReason[d.reason ?? 'other'] = (byReason[d.reason ?? 'other'] ?? 0) + 1;
    if (d.valid !== entry.valid || d.reason !== entry.reason) {
      entry.valid = d.valid;
      if (d.reason) entry.reason = d.reason;
      else delete entry.reason;
      if (d.detail) entry.reasonDetail = d.detail;
      else delete entry.reasonDetail;
      changed++;
    }
  }
  if (changed > 0) {
    await saveRepoCache(map);
    await invalidateSummaryCache();
  }
  return { repos, changed, nowValid, byReason };
}
