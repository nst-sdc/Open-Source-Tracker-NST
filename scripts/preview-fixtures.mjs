#!/usr/bin/env node
/**
 * Stages data/preview-fixtures/ into data/kv/ for Vercel preview builds.
 *
 * Previews deliberately run with no KV credentials. lib/kv.ts falls back to
 * disk when KV_REST_API_URL/TOKEN are absent, so copying the fixture into
 * data/kv/ gives a preview a full-looking leaderboard without handing a pull
 * request branch any secrets — no Upstash token, no GitHub token, no admin
 * password. That is what makes previews work for fork pull requests, where
 * Vercel withholds environment variables by design.
 *
 * Runs as part of `npm run build` and is a no-op everywhere except a Vercel
 * preview, so local builds, CI and the production Docker image are untouched.
 * Set PREVIEW_FIXTURES=1 to force it when testing the preview build locally.
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const isVercelPreview = process.env.VERCEL_ENV === 'preview';
const forced = process.env.PREVIEW_FIXTURES === '1';

if (!isVercelPreview && !forced) {
  process.exit(0);
}

const src = join(process.cwd(), 'data', 'preview-fixtures');
const dest = join(process.cwd(), 'data', 'kv');

if (!existsSync(src)) {
  // Not fatal: a preview with no fixture still builds, it just comes up empty.
  console.warn('[preview-fixtures] data/preview-fixtures/ is missing — preview will have no data.');
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[preview-fixtures] staged ${readdirSync(src).length} files into data/kv/`);
