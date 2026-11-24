/**
 * GET /api/org-languages
 *
 * Language shares of every measured organisation (lib/org-languages.ts),
 * by lower-case login, for the explorer's language filter and sort.
 */
import { measureOrgLanguages, readOrgLanguagesForWrite, readOrgLanguages, toLanguageMap, writeOrgLanguages } from '@/lib/org-languages';
import { getGitHubHeaders } from '@/lib/github';

export const dynamic = 'force-dynamic';

/** GET /api/org-languages → every profile. GET /api/org-languages?login=x →
 *  that organisation's profile, measured on the spot when the background
 *  refresh has not reached it yet (one GraphQL call), so an open sheet never
 *  waits for the next tick. */
export async function GET(request: Request) {
  const login = new URL(request.url).searchParams.get('login');
  if (!login) {
    const store = await readOrgLanguages();
    return Response.json(toLanguageMap(store), {
      headers: { 'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600' },
    });
  }
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) return Response.json({ error: 'bad login' }, { status: 400 });
  const key = login.toLowerCase();
  const { ok, store } = await readOrgLanguagesForWrite();
  const known = store[key];
  if (known) return Response.json({ login, profile: known.missing ? null : toLanguageMap({ [key]: known })[key] ?? null, measured: true });
  const out = await measureOrgLanguages(login, await getGitHubHeaders());
  if (out.kind === 'rate-limited') return Response.json({ login, profile: null, measured: false, reason: 'rate-limited' }, { status: 503 });
  if (out.kind === 'error') return Response.json({ login, profile: null, measured: false, reason: out.message }, { status: 502 });
  const record = out.kind === 'ok' ? out.record : { login, measuredAt: new Date().toISOString(), missing: true as const, repos: 0, totalRepos: 0, languages: [] };
  if (ok) {
    store[key] = record;
    await writeOrgLanguages(store);
  }
  return Response.json({ login, profile: out.kind === 'ok' ? toLanguageMap({ [key]: record })[key] ?? null : null, measured: true });
}
