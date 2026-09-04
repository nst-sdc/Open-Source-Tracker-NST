#!/usr/bin/env node
/**
 * Repeatedly triggers the incremental refresh endpoint against a locally
 * running `npm run dev` instance to build up a real local dataset — the
 * same endpoint the production CronJob hits every 15 minutes, just called
 * back-to-back here instead of waiting on that schedule.
 *
 * Needs `npm run dev` already running in another terminal, and CRON_SECRET
 * set to the same value in both that terminal's .env.local and this command
 * (pick any string for local dev — see .env.example).
 *
 * Usage:
 *   npm run bootstrap-data [-- iterations]
 *
 * Reads CRON_SECRET from .env.local automatically. Defaults to 10 iterations
 * (~15-25 real students populated per iteration, ~2-3 min each). Stops early
 * if two iterations in a row update nobody.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;
const ITERATIONS = Number(process.argv[2]) || 10;

if (!CRON_SECRET) {
  console.error('CRON_SECRET is not set in .env.local (pick any string for local dev — see .env.example).');
  process.exit(1);
}

let totalUpdated = 0;
let emptyStreak = 0;

for (let i = 1; i <= ITERATIONS; i++) {
  process.stdout.write(`[${i}/${ITERATIONS}] refreshing... `);
  const start = Date.now();

  let res, body;
  try {
    res = await fetch(`${BASE_URL}/api/refresh/incremental`, {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET, 'Content-Type': 'application/json' },
    });
    body = await res.json();
  } catch (err) {
    console.log(`request failed: ${err.message}`);
    console.log('   Is `npm run dev` running in another terminal?');
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);

  if (!res.ok) {
    console.log(`HTTP ${res.status}: ${body.error || JSON.stringify(body)}`);
    if (res.status === 401) {
      console.log('   CRON_SECRET here must match the one in .env.local — check both.');
    }
    process.exit(1);
  }

  const updatedCount = body.updatedUsers?.length || 0;
  totalUpdated += updatedCount;
  console.log(`${updatedCount} students updated in ${elapsed}s (${totalUpdated} total so far)`);

  if (updatedCount === 0) {
    emptyStreak++;
    if (emptyStreak >= 2) {
      console.log('\nNothing left to refresh right now — stopping early.');
      break;
    }
  } else {
    emptyStreak = 0;
  }
}

console.log(`\nDone. ${totalUpdated} students now have real data. Refresh http://localhost:3000/contributors to see them.`);
