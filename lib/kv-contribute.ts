import { kvGet, kvSet } from './kv';

const KV_KEY = 'contribute_items';
const CLAIM_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type ContributeType = 'issue' | 'repo';
export type ContributeStatus = 'pending' | 'approved' | 'rejected';

export interface ContributeItem {
  id: string;
  type: ContributeType;
  repoLink: string;
  description: string;
  submittedBy: string; // GitHub username, or 'NST SDC Team' for admin-added items
  submittedAt: string; // ISO
  status: ContributeStatus;
  // Issue-only fields
  siteLink?: string;
  issueLink?: string;
  screenshotUrl?: string;
  claimedBy?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
}

async function getAllItems(): Promise<ContributeItem[]> {
  return (await kvGet<ContributeItem[]>(KV_KEY)) || [];
}

/** Clears any claim past its 7-day expiry. Mutates in place and reports
 * whether anything changed, so callers only write back when needed. */
function releaseExpiredClaims(items: ContributeItem[]): boolean {
  const now = Date.now();
  let changed = false;
  for (const item of items) {
    if (item.claimedBy && item.claimExpiresAt && new Date(item.claimExpiresAt).getTime() <= now) {
      delete item.claimedBy;
      delete item.claimedAt;
      delete item.claimExpiresAt;
      changed = true;
    }
  }
  return changed;
}

/** Public-facing list: approved items only, with expired claims cleared. */
export async function getApprovedContributeItemsKV(): Promise<ContributeItem[]> {
  const items = await getAllItems();
  if (releaseExpiredClaims(items)) {
    await kvSet(KV_KEY, items);
  }
  return items.filter((i) => i.status === 'approved');
}

/** Admin-facing list: everything, regardless of status. */
export async function getAllContributeItemsKV(): Promise<ContributeItem[]> {
  const items = await getAllItems();
  if (releaseExpiredClaims(items)) {
    await kvSet(KV_KEY, items);
  }
  return items;
}

export async function addContributeItem(
  input: Omit<ContributeItem, 'id' | 'submittedAt' | 'status'> & { status?: ContributeStatus }
): Promise<ContributeItem> {
  const items = await getAllItems();
  const item: ContributeItem = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    submittedAt: new Date().toISOString(),
    status: input.status ?? 'pending',
  };
  items.push(item);
  await kvSet(KV_KEY, items);
  return item;
}

export async function updateContributeItemStatus(
  id: string,
  status: 'approved' | 'rejected'
): Promise<{ ok: boolean }> {
  const items = await getAllItems();
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false };
  item.status = status;
  await kvSet(KV_KEY, items);
  return { ok: true };
}

export async function claimContributeItem(
  id: string,
  username: string
): Promise<{ ok: boolean; message?: string }> {
  const items = await getAllItems();
  releaseExpiredClaims(items);
  const item = items.find((i) => i.id === id);
  if (!item || item.status !== 'approved') return { ok: false, message: 'Issue not found' };
  if (item.type !== 'issue') return { ok: false, message: 'Only issues can be claimed' };
  if (item.claimedBy) return { ok: false, message: `Already claimed by @${item.claimedBy}` };

  item.claimedBy = username;
  item.claimedAt = new Date().toISOString();
  item.claimExpiresAt = new Date(Date.now() + CLAIM_DURATION_MS).toISOString();
  await kvSet(KV_KEY, items);
  return { ok: true };
}
