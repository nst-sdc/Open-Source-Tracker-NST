/**
 * GET /api/gsoc-orgs
 *
 * The GSoC organisations dataset (data/gsoc-orgs.json, 2016–2026): category,
 * description, website, logo, years, technologies, topics and project counts
 * per organisation. The organisations page fetches it once and joins it to
 * the cards by slug, so the page itself stays small.
 */
import gsocOrgs from '@/data/gsoc-orgs.json';

export const dynamic = 'force-static';

export function GET() {
  return Response.json(gsocOrgs, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
