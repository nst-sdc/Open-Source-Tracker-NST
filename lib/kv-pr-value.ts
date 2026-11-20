/**
 * lib/kv-pr-value.ts
 *
 * The admin switch for contribution-value weighting (lib/pr-value.ts), kept
 * in KV and primed into the synchronous scorer the way vouched orgs are.
 */
import { kvRead, kvSet } from './kv';
import { setPrValueWeighting, PR_VALUE_WEIGHTING_DEFAULT } from './pr-value';

export const PR_VALUE_SETTING_KEY = 'pr_value_weighting';
const PRIME_TTL_MS = 60_000;

export interface PrValueSetting {
  enabled: boolean;
  updatedAt?: string;
}

let primedAt = 0;
let lastGood: PrValueSetting | null = null;

export async function getPrValueSetting(): Promise<PrValueSetting> {
  const { ok, value } = await kvRead<PrValueSetting>(PR_VALUE_SETTING_KEY);
  if (ok && value && typeof value.enabled === 'boolean') {
    lastGood = value;
    return value;
  }
  // Nothing stored, or the store did not answer: what this process last
  // saw, else the default (on).
  return lastGood ?? { enabled: PR_VALUE_WEIGHTING_DEFAULT };
}

export async function setPrValueSetting(enabled: boolean): Promise<boolean> {
  const next: PrValueSetting = { enabled, updatedAt: new Date().toISOString() };
  if (!(await kvSet(PR_VALUE_SETTING_KEY, next))) return false;
  lastGood = next;
  setPrValueWeighting(enabled);
  primedAt = Date.now();
  return true;
}

/** Loads the switch into lib/pr-value so synchronous scoring sees it. */
export async function primePrValueWeighting(force = false): Promise<void> {
  if (!force && Date.now() - primedAt < PRIME_TTL_MS) return;
  const s = await getPrValueSetting();
  setPrValueWeighting(s.enabled);
  primedAt = Date.now();
}

export function _resetPrValueMemory(): void {
  primedAt = 0;
  lastGood = null;
  setPrValueWeighting(PR_VALUE_WEIGHTING_DEFAULT);
}
