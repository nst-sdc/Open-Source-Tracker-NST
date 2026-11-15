/**
 * Runs once when the Next.js server starts (Node runtime only). The only
 * thing it does is start the local auto-refresh loop when that is enabled —
 * see lib/local-auto-refresh.ts for when that is.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { isLocalAutoRefreshEnabled, startLocalAutoRefresh } = await import('./lib/local-auto-refresh');
  if (isLocalAutoRefreshEnabled()) startLocalAutoRefresh();
}
