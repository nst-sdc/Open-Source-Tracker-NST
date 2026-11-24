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

async function executeKVCommand(command: string[]): Promise<{ ok: boolean; result: unknown }> {
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

/**
 * Like kvGet, but says whether the answer can be trusted. `ok: false` means
 * the store did not answer (network, auth, 5xx), which is NOT the same as
 * the key being absent. Callers that would write a default when a key is
 * missing must use this and refuse to write on `ok: false`: the roster was
 * once overwritten with the image's bundled file because a failed GET looked
 * exactly like "no roster yet" (see lib/kv-students.ts).
 */
export async function kvRead<T>(key: string): Promise<{ ok: boolean; value: T | null }> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (url && token) {
    const { ok, result } = await executeKVCommand(['GET', key]);
    if (!ok) return { ok: false, value: null };
    if (result !== null && result !== undefined) {
      try {
        return { ok: true, value: JSON.parse(result as string) as T };
      } catch {
        return { ok: true, value: result as unknown as T };
      }
    }
    // Confirmed miss — fall back to disk files (deployed with the project)
    return { ok: true, value: readDiskKV<T>(key) };
  }

  return { ok: true, value: readDiskKV<T>(key) };
}

/**
 * Thrown by readers of data the app must not compute without (the repo
 * validity cache, flagged PRs, own-repo exceptions) when the store did not
 * answer and nothing is remembered in this process. Summaries built without
 * that data count every junk PR, which doubled the site's totals once.
 */
export class StoreUnavailableError extends Error {
  constructor(what: string) {
    super(`${what} could not be read from the store and nothing is remembered yet; refusing to continue without it.`);
    this.name = 'StoreUnavailableError';
  }
}

export async function kvGet<T>(key: string): Promise<T | null> {
  // A failed read reads as a miss here; use kvRead to tell them apart.
  return (await kvRead<T>(key)).value;
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
const KV_SET_ATTEMPTS = 3;
const KV_SET_RETRY_DELAY_MS = 400;

export async function kvSet<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const serialized = JSON.stringify(value);

  if (url && token) {
    const command = ttlSeconds
      ? ['SET', key, serialized, 'EX', String(ttlSeconds)]
      : ['SET', key, serialized];
    // A multi-megabyte SET (the summary caches are ~3.5 MB each) occasionally
    // dies with "other side closed" at the REST proxy. One retry with a short
    // pause has always been enough; three attempts keeps a transient blip
    // from being mistaken for a failed rebuild.
    for (let attempt = 1; attempt <= KV_SET_ATTEMPTS; attempt++) {
      const { ok } = await executeKVCommand(command);
      if (ok) return true;
      if (attempt < KV_SET_ATTEMPTS) {
        console.warn(`KV SET ${key} failed (attempt ${attempt}/${KV_SET_ATTEMPTS}); retrying`);
        await new Promise((r) => setTimeout(r, KV_SET_RETRY_DELAY_MS * attempt));
      }
    }
    return false;
  }

  writeDiskKV(key, value, ttlSeconds);
  return true;
}

/** True when a real Redis-compatible store is configured (not the disk fallback). */
export function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Runs raw Redis commands in one round trip through the REST proxy's
 * `/pipeline` endpoint (Upstash and serverless-redis-http both serve it).
 * Results come back in command order; a command that errored yields null.
 * `ok: false` means the store did not answer at all. There is no disk
 * fallback here: callers that need one in development bring their own.
 */
export async function kvPipeline(commands: string[][]): Promise<{ ok: boolean; results: unknown[] }> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token || commands.length === 0) return { ok: false, results: [] };
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`KV pipeline failed [${commands[0][0]} … ×${commands.length}]: ${res.status} ${body.slice(0, 300)}`);
      return { ok: false, results: [] };
    }
    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(data)) return { ok: false, results: [] };
    return { ok: true, results: data.map((d) => (d && 'result' in d ? d.result : null)) };
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err && err.digest === 'DYNAMIC_SERVER_USAGE') {
      throw err;
    }
    console.error(`KV pipeline threw [${commands[0][0]} … ×${commands.length}]:`, err);
    return { ok: false, results: [] };
  }
}
