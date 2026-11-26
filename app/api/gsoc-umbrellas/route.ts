import { NextResponse } from 'next/server';
import { GSOC_UMBRELLAS } from '@/lib/org-explorer';

/**
 * GET /api/gsoc-umbrellas?slug=numfocus
 *
 * What one GSoC umbrella organisation's ideas lists and its projects' code
 * links say about its sub-organisations (data/gsoc-umbrellas.json). The
 * organisation sheet reads it when an umbrella opens; the cards carry only
 * the counts.
 */
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  const detail = GSOC_UMBRELLAS[slug];
  if (!detail) return NextResponse.json({ error: 'Not an umbrella organisation' }, { status: 404 });
  return NextResponse.json(detail, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } });
}
