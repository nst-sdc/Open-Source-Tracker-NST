/**
 * lib/flagged.ts
 *
 * Stores flagged PRs in Vercel KV (or local disk KV fallback).
 * Previously used writeFileSync which was wiped on every Vercel deploy.
 */

import { kvRead, kvSet, StoreUnavailableError } from './kv';
import { readFileSync } from 'fs';
import { join } from 'path';

const KV_KEY = 'flagged_prs';

export type FlagReason = 'fake' | 'self_pr' | 'low_quality';

export interface FlaggedPR {
  /** "<owner>/<repo>#<number>" string */
  id: string;
  /** PR HTML URL for display */
  url: string;
  /** PR title for display */
  title: string;
  /** GitHub username of the PR author */
  author: string;
  /** Why this PR was flagged */
  reason: FlagReason;
  /** ISO timestamp when it was flagged */
  flaggedAt: string;
  /** Optional admin note */
  note?: string;
}

/** Read all flagged PRs from KV. Falls back to seeding from the committed JSON file. */
let lastGoodFlags: FlaggedPR[] | null = null;

export async function getFlaggedPRs(): Promise<FlaggedPR[]> {
  const { ok, value } = await kvRead<FlaggedPR[]>(KV_KEY);
  if (ok && value !== null) {
    lastGoodFlags = value;
    return value;
  }
  if (!ok) {
    // Never seed over a failed read: that replaced the admins' flags with the
    // committed file once. Serve what this process last saw, or refuse.
    if (lastGoodFlags) return lastGoodFlags;
    throw new StoreUnavailableError('The flagged-PR list');
  }

  // First-time seed: read from the committed JSON file if KV has nothing yet
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'flagged_prs.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const list: FlaggedPR[] = Array.isArray(parsed) ? parsed : [];
    // Persist into KV so next reads are fast (no TTL — flags never expire)
    await kvSet(KV_KEY, list);
    return list;
  } catch {
    return [];
  }
}

async function saveFlaggedPRs(list: FlaggedPR[]): Promise<void> {
  await kvSet(KV_KEY, list);
}

export async function isFlagged(prId: string): Promise<boolean> {
  const list = await getFlaggedPRs();
  return list.some((f) => f.id === prId);
}

export async function flagPR(entry: FlaggedPR): Promise<void> {
  const list = (await getFlaggedPRs()).filter((f) => f.id !== entry.id);
  list.push(entry);
  await saveFlaggedPRs(list);
}

export async function unflagPR(prId: string): Promise<boolean> {
  const before = await getFlaggedPRs();
  const after = before.filter((f) => f.id !== prId);
  if (after.length === before.length) return false;
  await saveFlaggedPRs(after);
  return true;
}

/** Returns a Set of flagged PR ids for fast O(1) lookup in ranking calculations. */
export async function getFlaggedPRIdSet(): Promise<Set<string>> {
  const list = await getFlaggedPRs();
  return new Set(list.map((f) => f.id));
}
