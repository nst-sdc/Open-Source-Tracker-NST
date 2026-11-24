/**
 * GET /api/org-languages
 *
 * Language shares of every measured organisation (lib/org-languages.ts),
 * by lower-case login, for the explorer's language filter and sort.
 */
import { readOrgLanguages, toLanguageMap } from '@/lib/org-languages';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = await readOrgLanguages();
  return Response.json(toLanguageMap(store), {
    headers: { 'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600' },
  });
}
