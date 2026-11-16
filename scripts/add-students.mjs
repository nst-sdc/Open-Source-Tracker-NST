#!/usr/bin/env node
/**
 * Bulk-add students to the live roster.
 *
 * Reads STUDENTS_FILE (default /work/students.txt): one student per line as
 *   username[, year][, campus]
 * Blank lines and lines starting with # are ignored; a leading @ is dropped;
 * commas, tabs or pipes may separate the fields. Year is "1st year" to
 * "4th year" (also accepts "1"/"1st"); campus is Rishihood, ADYPU or SVYASA
 * (case-insensitive).
 *
 * Each new name is looked up on GitHub so the roster entry carries the
 * numeric id (renames then resolve automatically). Names already on the
 * roster, by current or previous login, are skipped, never changed. Nothing
 * is removed.
 *
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... GITHUB_TOKEN=... \
 *   STUDENTS_FILE=./new-students.txt node scripts/add-students.mjs   # DRY_RUN=1 to preview
 *
 * In the cluster: deploy/jobs/add-students.yaml, with the list in a
 * ConfigMap. Safe to run repeatedly.
 */
import { readFileSync } from 'node:fs';

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
const FILE = process.env.STUDENTS_FILE ?? '/work/students.txt';
const ROSTER_KEY = 'students_list';

const YEARS = { 1: '1st year', 2: '2nd year', 3: '3rd year', 4: '4th year' };
const CAMPUSES = { rishihood: 'Rishihood', adypu: 'ADYPU', svyasa: 'SVYASA' };

function parseLine(line) {
  const parts = line.split(/[,\t|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const github = parts[0].replace(/^@/, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(github)) return { error: `not a GitHub username: ${parts[0]}` };
  const entry = { github };
  for (const p of parts.slice(1)) {
    const y = p.match(/^([1-4])(?:st|nd|rd|th)?(?:\s*year)?$/i);
    if (y) {
      entry.year = YEARS[y[1]];
      continue;
    }
    const c = CAMPUSES[p.toLowerCase()];
    if (c) {
      entry.campus = c;
      continue;
    }
    return { error: `cannot read "${p}" as a year or campus on line: ${line}` };
  }
  return entry;
}

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

async function githubUser(login) {
  const headers = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'oss-tracker-add-students' };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  for (;;) {
    const res = await fetch(`https://api.github.com/users/${login}`, { headers });
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const wait = Math.max(30_000, reset - Date.now() + 2_000);
      console.log(`rate limited; waiting ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`/users/${login} → ${res.status}`);
    return res.json();
  }
}

const lines = readFileSync(FILE, 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const wanted = [];
let bad = 0;
for (const line of lines) {
  const parsed = parseLine(line);
  if (!parsed) continue;
  if (parsed.error) {
    console.error(`  skip: ${parsed.error}`);
    bad++;
    continue;
  }
  wanted.push(parsed);
}
console.log(`${wanted.length} students in ${FILE}${bad ? `, ${bad} lines skipped` : ''}`);

console.log(`store ${KV.url} → ${await kv(['PING'])}${DRY ? '   (dry run)' : ''}`);
const raw = await kv(['GET', ROSTER_KEY]);
if (raw === null) {
  console.error('students_list is missing from the store; refusing to create it from a partial list');
  process.exit(1);
}
const roster = JSON.parse(raw);
const known = new Set();
for (const s of roster) {
  known.add(s.github.toLowerCase());
  for (const p of s.previousLogins ?? []) known.add(p.toLowerCase());
}
console.log(`roster has ${roster.length} students`);

const additions = [];
let dupes = 0;
let missing = 0;
for (const w of wanted) {
  if (known.has(w.github.toLowerCase())) {
    dupes++;
    continue;
  }
  const user = await githubUser(w.github);
  if (!user) {
    console.log(`  ${w.github}: no such GitHub account; added as unresolved (check the spelling)`);
    w.unresolvedSince = new Date().toISOString();
    missing++;
  } else {
    w.github = user.login; // GitHub's own casing
    w.githubId = user.id;
    console.log(`  ${w.github}${w.year ? `, ${w.year}` : ''}${w.campus ? `, ${w.campus}` : ''}`);
  }
  known.add(w.github.toLowerCase());
  additions.push(w);
}
console.log(`\n${additions.length} to add (${dupes} already tracked, ${missing} not found on GitHub)`);
if (additions.length === 0) process.exit(0);
if (DRY) {
  console.log('dry run; roster not written');
  process.exit(0);
}
const latest = JSON.parse(await kv(['GET', ROSTER_KEY]));
const latestLogins = new Set(latest.map((s) => s.github.toLowerCase()));
const fresh = additions.filter((a) => !latestLogins.has(a.github.toLowerCase()));
await kv(['SET', ROSTER_KEY, JSON.stringify([...latest, ...fresh])]);
console.log(`roster now has ${latest.length + fresh.length} students`);
await kv(['DEL', 'summary_cache:all']).catch(() => {});
