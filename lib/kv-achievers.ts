/**
 * lib/kv-achievers.ts
 *
 * KV-backed achievers list. Falls back to seeding from data/achievers.json on first load.
 */

import { kvGet, kvSet } from './kv';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PersonEntry, Program } from './data';

const KV_KEY = 'achievers_list';

async function seedFromFile(): Promise<PersonEntry[]> {
  try {
    const raw = readFileSync(join(process.cwd(), 'data', 'achievers.json'), 'utf-8');
    const data = JSON.parse(raw);
    const list: PersonEntry[] = Array.isArray(data) ? data : [];
    await kvSet(KV_KEY, list);
    return list;
  } catch {
    return [];
  }
}

export async function getAchieversKV(): Promise<PersonEntry[]> {
  const cached = await kvGet<PersonEntry[]>(KV_KEY);
  if (cached !== null) return cached;
  return seedFromFile();
}

/** Same program twice is a duplicate; the same program in a different year (or
 *  for a different org) is a genuinely separate achievement and both are kept. */
function isSameProgram(a: Program, b: Program): boolean {
  return (
    a.name.toLowerCase() === b.name.toLowerCase() &&
    (a.year ?? null) === (b.year ?? null) &&
    (a.org ?? '').toLowerCase() === (b.org ?? '').toLowerCase()
  );
}

/**
 * Adds an achiever, or merges new programs into one who already exists.
 *
 * Merging rather than rejecting is deliberate: people crack more than one
 * program (two GSoCs and an LFX, say), and the previous behaviour — a flat
 * "already in achievers" 409 — meant the only way to record the second one was
 * to find them in the list and use the edit panel, which read as the feature
 * being broken. Adding the same program twice is still a no-op.
 */
export async function addAchiever(entry: PersonEntry): Promise<{ ok: boolean; message?: string; merged?: boolean }> {
  const list = await getAchieversKV();
  const idx = list.findIndex((a) => a.github.toLowerCase() === entry.github.toLowerCase());

  if (idx === -1) {
    list.push(entry);
    await kvSet(KV_KEY, list);
    return { ok: true, merged: false };
  }

  const existing = list[idx];
  const added = entry.programs.filter((p) => !existing.programs.some((e) => isSameProgram(e, p)));
  if (added.length === 0) {
    return {
      ok: false,
      message: `${entry.github} already has ${entry.programs.length === 1 ? 'that program' : 'those programs'} recorded.`,
    };
  }

  list[idx] = {
    ...existing,
    // Only fill in details that were missing — never overwrite curated data
    // with blanks from a quick add.
    name: existing.name ?? entry.name,
    headline: existing.headline ?? entry.headline,
    bookingUrl: existing.bookingUrl ?? entry.bookingUrl,
    programs: [...existing.programs, ...added],
  };
  await kvSet(KV_KEY, list);
  return { ok: true, merged: true };
}

export async function updateAchiever(github: string, updates: Partial<PersonEntry>): Promise<{ ok: boolean }> {
  const list = await getAchieversKV();
  const idx = list.findIndex((a) => a.github.toLowerCase() === github.toLowerCase());
  if (idx === -1) return { ok: false };
  list[idx] = { ...list[idx], ...updates };
  await kvSet(KV_KEY, list);
  return { ok: true };
}

export async function deleteAchiever(github: string): Promise<{ ok: boolean }> {
  const list = await getAchieversKV();
  const updated = list.filter((a) => a.github.toLowerCase() !== github.toLowerCase());
  if (updated.length === list.length) return { ok: false };
  await kvSet(KV_KEY, updated);
  return { ok: true };
}

export async function getAchieverKV(github: string): Promise<PersonEntry | undefined> {
  const list = await getAchieversKV();
  return list.find((a) => a.github.toLowerCase() === github.toLowerCase());
}
