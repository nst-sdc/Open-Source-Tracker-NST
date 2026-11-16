#!/usr/bin/env node
/**
 * Puts back students the refresh loop dropped.
 *
 * Until November 2026 the loop removed a student from `students_list` the
 * moment GitHub answered 404 for their login, which is what every rename and
 * every deleted account looks like. The rest of the store still remembers
 * them: `summary_cache:*` entries carry login, numeric id, year and campus,
 * and `profile_cache:<login>` entries carry the profile. This script scans
 * both, finds everyone missing from the roster, asks GitHub what became of
 * each account (by id, so renames resolve to the new login) and adds them
 * back. Nothing is ever removed.
 *
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... GITHUB_TOKEN=ghp_... \
 *   node scripts/restore-roster.mjs          # DRY_RUN=1 to only report
 *
 * Plain Node 20, no dependencies, so it also runs as the Job in
 * deploy/jobs/restore-roster.yaml. Safe to run repeatedly.
 */
const need = (n) => {
  const v = process.env[n];
  if (!v) {
    console.error(`missing ${n}`);
    process.exit(2);
  }
  return v;
};
const KV = { url: need('KV_REST_API_URL').replace(/\/$/, ''), token: need('KV_REST_API_TOKEN') };
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const DRY = process.env.DRY_RUN === '1';
const ROSTER_KEY = 'students_list';

async function kv(command) {
  const res = await fetch(KV.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`${command[0]} ${command[1] ?? ''} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data.error) throw new Error(`${command[0]} ${command[1] ?? ''} → ${data.error}`);
  return data.result;
}
const kvGetJson = async (key) => {
  const raw = await kv(['GET', key]);
  return raw === null ? null : JSON.parse(raw);
};

async function github(path) {
  const headers = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'oss-tracker-restore-roster' };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  for (;;) {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const wait = Math.max(30_000, reset - Date.now() + 2_000);
      console.log(`rate limited; waiting ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }
}

console.log(`store ${KV.url} → ${await kv(['PING'])}${DRY ? '   (dry run)' : ''}${GITHUB_TOKEN ? '' : '   (no GITHUB_TOKEN: 60 lookups/hour)'}`);

const roster = (await kvGetJson(ROSTER_KEY)) ?? [];
const onRoster = new Set();
for (const s of roster) {
  onRoster.add(s.github.toLowerCase());
  for (const p of s.previousLogins ?? []) onRoster.add(p.toLowerCase());
}
console.log(`roster has ${roster.length} students`);

// Everyone the store has ever summarised or cached a profile for.
let cursor = '0';
const keys = [];
do {
  const [next, batch] = await kv(['SCAN', cursor, 'MATCH', '*_cache:*', 'COUNT', '500']);
  cursor = String(next);
  keys.push(...batch);
} while (cursor !== '0');

const seen = new Map(); // lower login -> { login, id, year, campus }
const remember = (profile, extra = {}) => {
  if (!profile?.login) return;
  const lower = profile.login.toLowerCase();
  const cur = seen.get(lower) ?? { login: profile.login };
  if (typeof profile.id === 'number') cur.id = profile.id;
  cur.year ??= extra.year;
  cur.campus ??= extra.campus;
  seen.set(lower, cur);
};
for (const key of keys) {
  if (key.startsWith('summary_cache:')) {
    const cache = await kvGetJson(key);
    for (const s of cache?.summaries ?? []) remember(s.profile, s);
  } else if (key.startsWith('profile_cache:')) {
    const entry = await kvGetJson(key);
    remember(entry?.profile);
  }
}
const missing = [...seen.values()].filter((c) => !onRoster.has(c.login.toLowerCase()));
console.log(`${seen.size} people remembered by caches, ${missing.length} not on the roster`);

const additions = [];
let renamed = 0;
let unresolved = 0;
for (const c of missing) {
  const user = typeof c.id === 'number' ? await github(`/user/${c.id}`) : await github(`/users/${c.login}`);
  const entry = { github: c.login };
  if (c.year) entry.year = c.year;
  if (c.campus) entry.campus = c.campus;
  if (user) {
    entry.githubId = user.id;
    if (user.login.toLowerCase() !== c.login.toLowerCase()) {
      if (onRoster.has(user.login.toLowerCase())) {
        console.log(`  ${c.login} → @${user.login}, already on the roster; skipping`);
        continue;
      }
      entry.github = user.login;
      entry.previousLogins = [c.login];
      renamed++;
      console.log(`  ${c.login} → @${user.login} (renamed)`);
    } else {
      console.log(`  ${c.login} (account exists; had been dropped by mistake)`);
    }
  } else {
    if (typeof c.id === 'number') entry.githubId = c.id;
    entry.unresolvedSince = new Date().toISOString();
    unresolved++;
    console.log(`  ${c.login} (gone from GitHub; kept as unresolved)`);
  }
  onRoster.add(entry.github.toLowerCase());
  additions.push(entry);
}

console.log(`\n${additions.length} to add back: ${additions.length - renamed - unresolved} unchanged logins, ${renamed} renamed, ${unresolved} unresolved`);
if (additions.length === 0) process.exit(0);
if (DRY) {
  console.log('dry run; roster not written');
  process.exit(0);
}
// Re-read right before writing so a concurrent admin edit is not lost.
const latest = (await kvGetJson(ROSTER_KEY)) ?? [];
const latestLogins = new Set(latest.map((s) => s.github.toLowerCase()));
const fresh = additions.filter((a) => !latestLogins.has(a.github.toLowerCase()));
await kv(['SET', ROSTER_KEY, JSON.stringify([...latest, ...fresh])]);
console.log(`roster now has ${latest.length + fresh.length} students`);
// Summary caches are rebuilt by the next refresh tick; nudge it.
await kv(['DEL', 'summary_cache:all']).catch(() => {});
