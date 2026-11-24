/**
 * lib/usage.ts
 *
 * First-party usage counting: how many people open the site each day, how
 * many of them are signed in, which pages they read and where they came from.
 *
 * What is stored is counts, never people. Unique visitors and signed-in
 * users go into HyperLogLogs, which keep a fixed 12 KB of registers and
 * cannot be turned back into the ids that were added. Nothing here can
 * answer "what did this student look at"; it can only answer "how many".
 *
 * Days are Indian days (Asia/Kolkata), because that is when the campuses
 * are awake: a UTC day would split every evening in two.
 *
 * Keys, one set per day, all expiring after USAGE_RETENTION_DAYS:
 *   usage:day:<day>    hash  views, signed, new, h:00 … h:23
 *   usage:pages:<day>  hash  route pattern -> views
 *   usage:refs:<day>   hash  referring host -> views
 *   usage:v:<day>      HLL   visitors (browser ids)
 *   usage:u:<day>      HLL   signed-in users (GitHub account ids)
 */
import { createHash } from 'node:crypto';
import { kvConfigured, kvGet, kvPipeline, kvSet } from './kv';

export const USAGE_RETENTION_DAYS = 400;
export const USAGE_MAX_RANGE_DAYS = 365;
const TTL = String(USAGE_RETENTION_DAYS * 24 * 60 * 60);
const TIME_ZONE = 'Asia/Kolkata';

/** Sections of the site that are counted. Anything else (admin, 404s, junk
 *  sent straight to the endpoint) is ignored, which also bounds how many
 *  fields a day's page hash can ever have. */
const SECTIONS = new Set([
  'achievers', 'check-work', 'contributors', 'documentation', 'get-started', 'issues',
  'join', 'kairi', 'login', 'organizations', 'programs', 'repo-activity',
]);
/** Sections whose second segment is a GitHub login; collapsed to one row. */
const PROFILE_SECTIONS = new Set(['achievers', 'check-work', 'contributors']);

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|preview|scrape|curl|wget|python-requests|node-fetch|axios|go-http/i;

/** `YYYY-MM-DD` of the Indian day containing `now`. */
export function usageDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Hour of the Indian day, `00`–`23`. */
export function usageHour(now: Date = new Date()): string {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(now);
  return h.padStart(2, '0').slice(0, 2);
}

/** The last `days` Indian days ending today, oldest first. */
export function usageDays(days: number, now: Date = new Date()): string[] {
  const [y, m, d] = usageDay(now).split('-').map(Number);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  }
  return out;
}

/** Route pattern for a pathname, or null when the path is not counted. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.length > 300) return null;
  const segments = raw.split(/[?#]/)[0].split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const section = segments[0].toLowerCase();
  if (!SECTIONS.has(section)) return null;
  if (segments.length === 1) return `/${section}`;
  if (segments.length === 2 && PROFILE_SECTIONS.has(section)) return `/${section}/[username]`;
  return null;
}

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}

/** Host of an outside referrer, or null for none / our own pages / junk. */
export function referrerHost(raw: unknown, ownHost: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > 2000) return null;
  let host: string;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    host = url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!/^[a-z0-9.-]{3,80}$/.test(host) || !host.includes('.')) return null;
  const own = (ownHost ?? '').toLowerCase().split(':')[0].replace(/^www\./, '');
  if (own && host === own) return null;
  return host;
}

/**
 * What a browser is counted as. The page sends a random id it keeps in
 * localStorage, because a campus sits behind one public address and an
 * address-based id would count a whole hostel as one visitor. Without one
 * (storage blocked) the address and browser string stand in.
 */
export function visitorKey(clientId: unknown, ip: string, userAgent: string): string {
  if (typeof clientId === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(clientId)) return clientId;
  return createHash('sha256').update(`${ip}|${userAgent}`).digest('hex').slice(0, 32);
}

// ─── Store ───────────────────────────────────────────────────────────────────
// Development has no Redis, so the five commands used here are also
// implemented over one JSON document in the disk fallback. Sets stand in for
// HyperLogLogs there, which is exact and fine at development sizes.

const LOCAL_KEY = 'usage_local';
type LocalStore = Record<string, Record<string, number> | string[]>;

function runLocal(store: LocalStore, [op, key, ...args]: string[]): unknown {
  switch (op) {
    case 'HINCRBY': {
      const hash = (store[key] ??= {}) as Record<string, number>;
      hash[args[0]] = (hash[args[0]] ?? 0) + Number(args[1]);
      return hash[args[0]];
    }
    case 'PFADD': {
      const set = (store[key] ??= []) as string[];
      if (set.includes(args[0])) return 0;
      set.push(args[0]);
      return 1;
    }
    case 'HGETALL':
      return Object.entries((store[key] ?? {}) as Record<string, number>).flatMap(([k, v]) => [k, String(v)]);
    case 'PFCOUNT':
      return new Set([key, ...args].flatMap((k) => (store[k] ?? []) as string[])).size;
    default:
      return null; // EXPIRE: nothing to do on disk
  }
}

async function run(commands: string[][]): Promise<{ ok: boolean; results: unknown[] }> {
  if (kvConfigured()) return kvPipeline(commands);
  const store = (await kvGet<LocalStore>(LOCAL_KEY)) ?? {};
  const results = commands.map((c) => runLocal(store, c));
  if (commands.some((c) => c[0] === 'HINCRBY' || c[0] === 'PFADD')) await kvSet(LOCAL_KEY, store);
  return { ok: true, results };
}

// ─── Write ───────────────────────────────────────────────────────────────────

export interface Pageview {
  /** Route pattern from normalizePath. */
  path: string;
  /** From visitorKey. */
  visitor: string;
  /** GitHub account id when signed in. */
  userId?: number | null;
  /** Outside host from referrerHost. */
  referrer?: string | null;
  /** The browser had no visitor id before this view. */
  firstVisit?: boolean;
  now?: Date;
}

/** Counts one page view. Returns false when the store did not take it. */
export async function recordPageview(view: Pageview): Promise<boolean> {
  const now = view.now ?? new Date();
  const day = usageDay(now);
  const k = { day: `usage:day:${day}`, pages: `usage:pages:${day}`, refs: `usage:refs:${day}`, v: `usage:v:${day}`, u: `usage:u:${day}` };

  const commands: string[][] = [
    ['HINCRBY', k.day, 'views', '1'],
    ['HINCRBY', k.day, `h:${usageHour(now)}`, '1'],
    ['HINCRBY', k.pages, view.path, '1'],
    ['PFADD', k.v, view.visitor],
    ['EXPIRE', k.day, TTL],
    ['EXPIRE', k.pages, TTL],
    ['EXPIRE', k.v, TTL],
  ];
  if (view.firstVisit) commands.push(['HINCRBY', k.day, 'new', '1']);
  if (view.userId) {
    commands.push(['HINCRBY', k.day, 'signed', '1'], ['PFADD', k.u, String(view.userId)], ['EXPIRE', k.u, TTL]);
  }
  if (view.referrer) commands.push(['HINCRBY', k.refs, view.referrer, '1'], ['EXPIRE', k.refs, TTL]);

  return (await run(commands)).ok;
}

// ─── Read ────────────────────────────────────────────────────────────────────

export interface UsageDayRow {
  day: string;
  /** Distinct browsers that opened the site. */
  visitors: number;
  /** Distinct signed-in GitHub accounts. */
  users: number;
  views: number;
  /** Browsers seen for the first time. */
  newVisitors: number;
}

export interface UsageReport {
  days: UsageDayRow[];
  /** Distinct over the whole range, not the sum of the days. */
  rangeVisitors: number;
  rangeUsers: number;
  /** Distinct over the last 7 days of the range. */
  weekVisitors: number;
  weekUsers: number;
  totalViews: number;
  pages: Array<{ path: string; views: number }>;
  referrers: Array<{ host: string; views: number }>;
  /** Views by hour of the Indian day, index 0–23, summed over the range. */
  hours: number[];
}

function hashOf(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = Number(raw[i + 1]) || 0;
  } else if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) out[key] = Number(value) || 0;
  }
  return out;
}

function ranked(totals: Map<string, number>, limit: number): Array<[string, number]> {
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

/** The last `days` days of usage, or null when the store did not answer. */
export async function readUsage(days: number, now: Date = new Date()): Promise<UsageReport | null> {
  const span = Math.min(USAGE_MAX_RANGE_DAYS, Math.max(1, Math.floor(days) || 30));
  const list = usageDays(span, now);
  const week = list.slice(-7);
  const PER_DAY = 5;

  const commands = list.flatMap((d) => [
    ['HGETALL', `usage:day:${d}`],
    ['PFCOUNT', `usage:v:${d}`],
    ['PFCOUNT', `usage:u:${d}`],
    ['HGETALL', `usage:pages:${d}`],
    ['HGETALL', `usage:refs:${d}`],
  ]);
  commands.push(
    ['PFCOUNT', ...list.map((d) => `usage:v:${d}`)],
    ['PFCOUNT', ...list.map((d) => `usage:u:${d}`)],
    ['PFCOUNT', ...week.map((d) => `usage:v:${d}`)],
    ['PFCOUNT', ...week.map((d) => `usage:u:${d}`)],
  );

  const { ok, results } = await run(commands);
  if (!ok) return null;

  const pages = new Map<string, number>();
  const refs = new Map<string, number>();
  const hours = Array<number>(24).fill(0);
  const rows = list.map((day, i) => {
    const at = i * PER_DAY;
    const counters = hashOf(results[at]);
    for (const [field, n] of Object.entries(counters)) {
      if (field.startsWith('h:')) hours[Number(field.slice(2))] += n;
    }
    for (const [path, n] of Object.entries(hashOf(results[at + 3]))) pages.set(path, (pages.get(path) ?? 0) + n);
    for (const [host, n] of Object.entries(hashOf(results[at + 4]))) refs.set(host, (refs.get(host) ?? 0) + n);
    return {
      day,
      visitors: Number(results[at + 1]) || 0,
      users: Number(results[at + 2]) || 0,
      views: counters.views ?? 0,
      newVisitors: counters.new ?? 0,
    };
  });

  const tail = list.length * PER_DAY;
  return {
    days: rows,
    rangeVisitors: Number(results[tail]) || 0,
    rangeUsers: Number(results[tail + 1]) || 0,
    weekVisitors: Number(results[tail + 2]) || 0,
    weekUsers: Number(results[tail + 3]) || 0,
    totalViews: rows.reduce((sum, r) => sum + r.views, 0),
    pages: ranked(pages, 20).map(([path, views]) => ({ path, views })),
    referrers: ranked(refs, 12).map(([host, views]) => ({ host, views })),
    hours,
  };
}
