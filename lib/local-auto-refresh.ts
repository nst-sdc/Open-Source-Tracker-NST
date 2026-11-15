/**
 * lib/local-auto-refresh.ts
 *
 * Fills in the leaderboard by itself on a local checkout.
 *
 * In production a Kubernetes CronJob calls /api/refresh/incremental every
 * fifteen minutes. On a laptop nothing does, so a fresh clone showed 1,800
 * zero-PR placeholders until someone ran `npm run bootstrap-data` and kept
 * reloading. This module runs the same tick in-process, fast while profiles
 * are still missing and slowly once everything is fresh, and
 * app/contributors/BootstrapBanner.tsx re-renders the page as data lands.
 *
 * Enabled when LOCAL_AUTO_REFRESH=1, or by default under `next dev`. Never
 * in production unless asked for explicitly: the cluster has the CronJob, and
 * three replicas each running this loop would triple the GitHub quota spend.
 *
 * Started once per process from instrumentation.ts.
 */
import { performIncrementalRefresh } from './incremental-refresh';

export const DELAY_WHILE_POPULATING_MS = 15_000;
export const DELAY_WHEN_FRESH_MS = 10 * 60_000;
export const DELAY_AFTER_ERROR_MS = 3 * 60_000;
export const INITIAL_DELAY_MS = 5_000;

export function isLocalAutoRefreshEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LOCAL_AUTO_REFRESH === '0') return false;
  if (env.LOCAL_AUTO_REFRESH === '1') return true;
  return env.NODE_ENV === 'development';
}

/** How long to wait before the next tick, given what the last one did. */
export function nextDelayMs(outcome: { error: boolean; attempted: number; updated: number }): number {
  if (outcome.error) return DELAY_AFTER_ERROR_MS;
  if (outcome.attempted === 0) return DELAY_WHEN_FRESH_MS;
  // Attempted but updated nothing: usually GitHub's rate limit. Back off a
  // little rather than hammering, but not the full error delay — one token
  // refreshes a couple of students a minute, so slow progress is progress.
  if (outcome.updated === 0) return 60_000;
  return DELAY_WHILE_POPULATING_MS;
}

type Global = typeof globalThis & { __ossTrackerAutoRefresh?: { started: boolean } };

export function startLocalAutoRefresh(): void {
  const g = globalThis as Global;
  // `next dev` re-evaluates modules on edit; the flag on globalThis survives
  // that and keeps it to one loop per process.
  if (g.__ossTrackerAutoRefresh?.started) return;
  g.__ossTrackerAutoRefresh = { started: true };

  if (!process.env.GITHUB_TOKEN) {
    console.warn(
      '[local-auto-refresh] GITHUB_TOKEN is not set. The leaderboard will fill in very slowly (60 anonymous requests an hour). ' +
        'Add a token to .env.local — no scopes needed — and restart.',
    );
  }
  console.log('[local-auto-refresh] on: the leaderboard fills itself in from GitHub in the background (LOCAL_AUTO_REFRESH=0 to disable).');

  const tick = async () => {
    let delay: number;
    try {
      const result = await performIncrementalRefresh();
      delay = nextDelayMs({ error: false, attempted: result.attemptedUsers.length, updated: result.updatedUsers.length });
      if (result.attemptedUsers.length === 0) {
        console.log(`[local-auto-refresh] all profiles fresh; next check in ${Math.round(delay / 60_000)} min`);
      }
    } catch (err) {
      delay = nextDelayMs({ error: true, attempted: 0, updated: 0 });
      console.error('[local-auto-refresh] tick failed:', err instanceof Error ? err.message : err);
    }
    setTimeout(tick, delay).unref();
  };

  setTimeout(tick, INITIAL_DELAY_MS).unref();
}
