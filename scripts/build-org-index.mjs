#!/usr/bin/env node
/*
 * One-off backfill for org_index.
 *
 * The incremental refresh keeps the index current, but it only touches profiles
 * it considers stale, so a fresh deploy would fill in over days with a
 * half-empty org filter in the meantime. This walks every profile cache once
 * and builds the whole thing.
 *
 * Reads only -- it makes no GitHub calls at all, because every PR already
 * names its repository owner.
 *
 *   node scripts/build-org-index.mjs            # write it
 *   node scripts/build-org-index.mjs --dry-run  # just report what it would write
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DRY = process.argv.includes('--dry-run');
const KV_DIR = join(process.cwd(), 'data', 'kv');
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  if (url && token) {
    const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { result } = await r.json();
    if (result != null) { try { return JSON.parse(result); } catch { return result; } }
    return null;
  }
  const f = join(KV_DIR, key.replace(/[:/]/g, '_') + '.json');
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8')).value ?? null;
}

async function kvSet(key, value) {
  if (url && token) {
    const r = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!r.ok) throw new Error(`KV write failed: ${r.status}`);
    return;
  }
  if (!existsSync(KV_DIR)) mkdirSync(KV_DIR, { recursive: true });
  writeFileSync(join(KV_DIR, key.replace(/[:/]/g, '_') + '.json'),
    JSON.stringify({ value, expiresAt: null }, null, 2));
}

function ownerOf(repositoryUrl) {
  if (!repositoryUrl) return null;
  const owner = repositoryUrl.replace('https://api.github.com/repos/', '').split('/')[0]?.trim();
  return owner && owner.length >= 2 ? owner : null;
}

const students = (await kvGet('students_list')) ?? [];

/* Only students who have actually opened a PR can appear in the org index, and
 * the summary cache already records that -- so there is no need to open 1,800
 * profiles to discover that two thirds of them are empty. One extra read here
 * replaces roughly 1,100 pointless ones.
 *
 * Nobody is missed by this: a student with no PRs cannot belong to any org, and
 * the moment their first PR lands the refresh updates their summary, which puts
 * them in scope for the next run. Falls back to the full roster if the summary
 * cache is missing (a brand-new environment), where the saving does not apply
 * anyway because no profiles exist either. */
/* The same filters the org page applies on render, so the dropdown's counts
 * agree with what you see after clicking. */
const flagged = new Set((await kvGet('flagged_prs')) ?? []);
const repoCache = (await kvGet('repo_cache_map')) ?? {};

const summary = await kvGet('summary_cache:all');
const active = summary?.summaries
  ? new Set(summary.summaries.filter((s) => (s.totalPRs ?? 0) > 0).map((s) => s.profile.login.toLowerCase()))
  : null;

const targets = active ? students.filter((s) => active.has(s.github.toLowerCase())) : students;
console.error(`roster: ${students.length} students -> ${targets.length} with PR activity to scan`
  + (active ? ` (skipping ${students.length - targets.length} with none)` : ' (no summary cache; scanning all)'));

const index = {};
let scanned = 0, withPrs = 0;

for (const student of targets) {
  const profile = await kvGet(`profile_cache:${student.github.toLowerCase()}`);
  scanned++;
  if (!profile?.prs?.length) continue;
  withPrs++;

  const perOwner = new Map();
  for (const pr of profile.prs) {
    if (!pr.pull_request?.merged_at || !pr.repository_url) continue;
    const repo = pr.repository_url.replace('https://api.github.com/repos/', '');
    if (flagged.has(`${repo}#${pr.number}`)) continue;
    if (repoCache[repo]?.valid === false) continue;
    const owner = ownerOf(pr.repository_url);
    if (!owner) continue;
    perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1);
  }
  for (const [owner, count] of perOwner) {
    const key = owner.toLowerCase();
    const e = (index[key] ??= { login: owner, contributors: {}, mergedPRs: 0 });
    e.contributors[student.github] = count;
    e.mergedPRs += count;
  }
  if (scanned % 250 === 0) console.error(`  ${scanned}/${targets.length} profiles, ${Object.keys(index).length} orgs`);
}

const orgs = Object.values(index).sort((a, b) => b.mergedPRs - a.mergedPRs);
console.error(`\nscanned ${scanned} profiles (${withPrs} had PRs) -> ${orgs.length} owners`);
console.error('top 10 by merged PRs:');
for (const o of orgs.slice(0, 10)) {
  console.error(`  ${o.login.padEnd(28)} ${String(o.mergedPRs).padStart(5)} merged  ${Object.keys(o.contributors).length} contributors`);
}

if (DRY) { console.error('\n--dry-run: nothing written'); process.exit(0); }
await kvSet('org_index', index);
console.error(`\nwrote org_index (${orgs.length} owners)`);
