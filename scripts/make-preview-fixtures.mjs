#!/usr/bin/env node
/**
 * Regenerates data/preview-fixtures/ from a populated local cache.
 *
 * Preview deployments run with no KV credentials, so lib/kv.ts falls back to
 * reading data/kv/ off disk (see scripts/preview-fixtures.mjs, which copies
 * these files into place at build time). That keeps previews free of secrets —
 * no Upstash token, no GitHub token, no admin password — which is what lets
 * them work for pull requests opened from forks, where Vercel deliberately
 * withholds environment variables.
 *
 * Run this only when the fixture needs refreshing:
 *
 *   npm run bootstrap-data          # populate data/kv/ with real data first
 *   node scripts/make-preview-fixtures.mjs
 *
 * It keeps a small, deterministic slice: every achiever (so the Hall of Fame
 * and its labels render), the top contributors by score, and a few students
 * with no activity (so the "registered, not contributing yet" section is not
 * empty). Everything else is dropped, including the ~1,700 per-student profile
 * caches that make the full cache far too large to sit in git.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

const KV = join(process.cwd(), 'data', 'kv');
const OUT = join(process.cwd(), 'data', 'preview-fixtures');

const TOP_CONTRIBUTORS = 30;
const IDLE_STUDENTS = 8;
/** Per-student cap. The full cache holds up to 1,000 pull requests each, which
 *  is far more than a preview needs and would put the fixture into the tens of
 *  megabytes. The newest slice is kept, so charts and lists still look real. */
const PRS_PER_STUDENT = 60;
const ISSUES_PER_STUDENT = 20;

function readKV(key) {
  const file = join(KV, `${key}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8')).value;
}

/** Fixtures must never expire — a stale expiresAt would make lib/kv.ts delete
 *  them on first read and the preview would come up empty. */
function writeFixture(key, value) {
  writeFileSync(join(OUT, `${key}.json`), JSON.stringify({ value, expiresAt: null }, null, 0));
}

if (!existsSync(KV)) {
  console.error('data/kv/ is empty — run `npm run bootstrap-data` first.');
  process.exit(1);
}

const summary = readKV('summary_cache_all');
const students = readKV('students_list') ?? [];
const achievers = readKV('achievers_list') ?? [];
if (!summary?.summaries?.length) {
  console.error('summary_cache_all is missing or empty — run `npm run bootstrap-data` first.');
  process.exit(1);
}

// 1. Choose the slice: achievers, then the strongest contributors, then a few
//    idle students so every section of the leaderboard has something in it.
const byScore = [...summary.summaries].sort((a, b) => b.scoreMergedPRs - a.scoreMergedPRs);
const keep = new Set(achievers.map((a) => a.github.toLowerCase()));
for (const s of byScore) {
  if (keep.size >= TOP_CONTRIBUTORS + achievers.length) break;
  keep.add(s.profile.login.toLowerCase());
}
const active = new Set(summary.summaries.map((s) => s.profile.login.toLowerCase()));
let idle = 0;
for (const s of students) {
  if (idle >= IDLE_STUDENTS) break;
  if (active.has(s.github.toLowerCase())) continue;
  keep.add(s.github.toLowerCase());
  idle++;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 2. Roster and summaries, narrowed to the slice.
writeFixture('students_list', students.filter((s) => keep.has(s.github.toLowerCase())));
writeFixture('achievers_list', achievers);
for (const period of ['all', 'week', 'month']) {
  const cache = readKV(`summary_cache_${period}`);
  if (!cache) continue;
  writeFixture(`summary_cache_${period}`, {
    ...cache,
    summaries: cache.summaries.filter((s) => keep.has(s.profile.login.toLowerCase())),
  });
}

// 3. Per-student profile caches for the slice only.
let profiles = 0;
const referencedRepos = new Set();
for (const file of readdirSync(KV)) {
  if (!file.startsWith('profile_cache_')) continue;
  const login = file.slice('profile_cache_'.length, -'.json'.length);
  if (!keep.has(login.toLowerCase())) continue;
  const entry = JSON.parse(readFileSync(join(KV, file), 'utf-8'));
  const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  const value = {
    ...entry.value,
    prs: [...(entry.value?.prs ?? [])].sort(byNewest).slice(0, PRS_PER_STUDENT),
    issues: [...(entry.value?.issues ?? [])].sort(byNewest).slice(0, ISSUES_PER_STUDENT),
  };
  writeFixture(`profile_cache_${login}`, value);
  profiles++;
  for (const pr of value.prs) {
    if (pr.repository_url) {
      referencedRepos.add(pr.repository_url.replace('https://api.github.com/repos/', ''));
    }
  }
}

// 4. Repo cache, narrowed to repos those students actually touched.
const repoCache = readKV('repo_cache_map') ?? {};
const trimmedRepos = Object.fromEntries(
  Object.entries(repoCache).filter(([full]) => referencedRepos.has(full))
);
writeFixture('repo_cache_map', trimmedRepos);

// 5. Small ancillary lists, kept as-is so admin screens are not blank.
for (const key of ['events_list', 'flagged_prs']) {
  const value = readKV(key);
  if (value !== null) writeFixture(key, value);
}

const bytes = readdirSync(OUT).reduce(
  (n, f) => n + readFileSync(join(OUT, f)).length, 0
);
console.log(
  `Wrote ${readdirSync(OUT).length} fixture files to data/preview-fixtures/ ` +
  `(${profiles} profiles, ${Object.keys(trimmedRepos).length} repos, ${(bytes / 1024 / 1024).toFixed(1)} MB)`
);
