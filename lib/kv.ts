/**
 * lib/kv.ts
 *
 * Key-Value cache layer.
 * Attempts to read/write using Vercel KV REST API.
 * If KV_REST_API_URL/TOKEN are missing, falls back to local file-based cache under data/kv/.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const KV_DIR = join(process.cwd(), 'data', 'kv');

interface DiskEntry<T> {
  value: T;
  expiresAt: number | null; // timestamp in ms
}

function getDiskFile(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(KV_DIR, `${safeKey}.json`);
}

function readDiskKV<T>(key: string): T | null {
  try {
    const file = getDiskFile(key);
    if (!existsSync(file)) return null;
    const raw = readFileSync(file, 'utf-8');
    const entry = JSON.parse(raw) as DiskEntry<T>;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      try {
        unlinkSync(file);
      } catch {}
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

function writeDiskKV<T>(key: string, value: T, ttlSeconds?: number): void {
  try {
    if (!existsSync(KV_DIR)) {
      mkdirSync(KV_DIR, { recursive: true });
    }
    const file = getDiskFile(key);
    const entry: DiskEntry<T> = {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    };
    writeFileSync(file, JSON.stringify(entry, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

async function executeKVCommand(command: string[]): Promise<{ ok: boolean; result: any }> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return { ok: false, result: null };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`KV command failed [${command[0]} ${command[1]}]: ${res.status} ${body.slice(0, 300)}`);
      return { ok: false, result: null };
    }
    const data = await res.json();
    return { ok: true, result: data.result };
  } catch (err) {
    // Next.js signals static-render bailout via a thrown error with this digest —
    // let it propagate so the route is correctly marked dynamic, don't log it as a KV failure.
    if (err && typeof err === 'object' && 'digest' in err && err.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    console.error(`KV command threw [${command[0]} ${command[1]}]:`, err);
    return { ok: false, result: null };
  }
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (url && token) {
    const { result } = await executeKVCommand(['GET', key]);
    // If Redis has data, use it
    if (result !== null && result !== undefined) {
      try {
        return JSON.parse(result) as T;
      } catch {
        return result as unknown as T;
      }
    }
    // Redis miss — fall back to disk files (deployed with the project)
    return readDiskKV<T>(key);
  }

  return readDiskKV<T>(key);
}

/** Deletes a key from Redis (or the disk fallback). Returns true if deleted or absent. */
export async function kvDel(key: string): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (url && token) {
    const { ok } = await executeKVCommand(['DEL', key]);
    if (!ok) return false;
  }

  try {
    const file = getDiskFile(key);
    if (existsSync(file)) unlinkSync(file);
  } catch {
    return false;
  }
  return true;
}

/** Returns true if the value was actually persisted to Redis (or disk fallback). */
export async function kvSet<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const serialized = JSON.stringify(value);

  if (url && token) {
    const command = ttlSeconds
      ? ['SET', key, serialized, 'EX', String(ttlSeconds)]
      : ['SET', key, serialized];
    const { ok } = await executeKVCommand(command);
    return ok;
  }

  writeDiskKV(key, value, ttlSeconds);
  return true;
}
