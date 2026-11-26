/**
 * lib/kv-commands.ts
 *
 * Raw store commands with a development fallback. Production sends them to
 * the KV REST pipeline (Valkey behind serverless-redis-http). Development
 * has no Redis, so the handful of commands used by this codebase are also
 * implemented over one JSON document in the disk fallback: hashes, sets
 * (standing in for HyperLogLogs, exact at development sizes), string keys
 * with NX/PX, and DEL.
 *
 * Why raw commands exist next to kvGet/kvSet: a GET-modify-SET of a whole
 * JSON list is not atomic, so two pods writing within the same few hundred
 * milliseconds lose one of the writes. HSET, HINCRBY and SET NX are applied
 * atomically by the store, so anything that several students can write at
 * once (form responses, counters, locks) goes through here.
 */
import { kvConfigured, kvGet, kvPipeline, kvSet } from './kv';

const LOCAL_KEY = 'usage_local';
type LocalHash = Record<string, number | string>;
type LocalValue = LocalHash | string[] | { v: string; exp: number | null };
type LocalStore = Record<string, LocalValue>;

const WRITES = new Set(['HINCRBY', 'PFADD', 'HSET', 'HDEL', 'SET', 'DEL']);

function runLocal(store: LocalStore, [op, key, ...args]: string[], nowMs: number): unknown {
  switch (op) {
    case 'HINCRBY': {
      const hash = (store[key] ??= {}) as LocalHash;
      hash[args[0]] = Number(hash[args[0]] ?? 0) + Number(args[1]);
      return hash[args[0]];
    }
    case 'HSET': {
      const hash = (store[key] ??= {}) as LocalHash;
      let added = 0;
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (!(args[i] in hash)) added++;
        hash[args[i]] = args[i + 1];
      }
      return added;
    }
    case 'HGET': {
      const hash = (store[key] ?? {}) as LocalHash;
      return args[0] in hash ? String(hash[args[0]]) : null;
    }
    case 'HDEL': {
      const hash = (store[key] ?? {}) as LocalHash;
      let removed = 0;
      for (const f of args) if (f in hash) { delete hash[f]; removed++; }
      return removed;
    }
    case 'HLEN':
      return Object.keys((store[key] ?? {}) as LocalHash).length;
    case 'HGETALL':
      return Object.entries((store[key] ?? {}) as LocalHash).flatMap(([k, v]) => [k, String(v)]);
    case 'PFADD': {
      const set = (store[key] ??= []) as string[];
      if (set.includes(args[0])) return 0;
      set.push(args[0]);
      return 1;
    }
    case 'PFCOUNT':
      return new Set([key, ...args].flatMap((k) => (store[k] ?? []) as string[])).size;
    case 'SET': {
      // SET key value [NX] [PX ms]
      const value = args[0];
      const nx = args.includes('NX');
      const pxAt = args.indexOf('PX');
      const exp = pxAt >= 0 ? nowMs + Number(args[pxAt + 1]) : null;
      const cur = store[key] as { v: string; exp: number | null } | undefined;
      const live = cur && 'v' in cur && (cur.exp === null || cur.exp > nowMs);
      if (nx && live) return null;
      store[key] = { v: value, exp };
      return 'OK';
    }
    case 'GET': {
      const cur = store[key] as { v: string; exp: number | null } | undefined;
      return cur && 'v' in cur && (cur.exp === null || cur.exp > nowMs) ? cur.v : null;
    }
    case 'DEL': {
      let n = 0;
      for (const k of [key, ...args]) if (k in store) { delete store[k]; n++; }
      return n;
    }
    default:
      return null; // EXPIRE: nothing to do on disk
  }
}

// The fallback document is read-modify-written, so calls are serialised
// within the process; that gives development the same "no lost writes"
// behaviour the store gives production.
let localQueue: Promise<unknown> = Promise.resolve();

/** Runs the commands in order; `ok: false` when the store did not answer. */
export async function runCommands(commands: string[][], nowMs = Date.now()): Promise<{ ok: boolean; results: unknown[] }> {
  if (commands.length === 0) return { ok: true, results: [] };
  if (kvConfigured()) return kvPipeline(commands);
  const task = localQueue.then(async () => {
    const store = (await kvGet<LocalStore>(LOCAL_KEY)) ?? {};
    const results = commands.map((c) => runLocal(store, c, nowMs));
    if (commands.some((c) => WRITES.has(c[0]))) await kvSet(LOCAL_KEY, store);
    return { ok: true, results };
  });
  localQueue = task.catch(() => undefined);
  return task;
}

/** A hash as {field: value}, whatever shape the store returned it in. */
export function hashEntries(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) out[k] = String(v);
  }
  return out;
}

/**
 * Runs `fn` while holding a short store-side lock (SET NX PX), for the few
 * read-modify-write paths that cannot be made atomic, such as adding to
 * the roster list. Waits up to ~2 s for a busy lock; returns null without
 * running `fn` if it never gets it, so callers can defer to a reconcile.
 */
export async function withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>, attempts = 8, waitMs = 250): Promise<T | null> {
  const key = `lock:${name}`;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  for (let i = 0; i < attempts; i++) {
    const { ok, results } = await runCommands([['SET', key, token, 'NX', 'PX', String(ttlMs)]]);
    if (ok && results[0] === 'OK') {
      try {
        return await fn();
      } finally {
        const { results: cur } = await runCommands([['GET', key]]);
        if (cur[0] === token) await runCommands([['DEL', key]]);
      }
    }
    if (!ok) return null;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return null;
}
