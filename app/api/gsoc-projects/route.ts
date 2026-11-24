/**
 * GET /api/gsoc-projects?slug=sugar-labs&year=2024
 *
 * The organisation's GSoC projects that year, from the official GSoC site
 * (see lib/gsoc-projects.ts). Cached a week server-side; an hour at the edge.
 */
import { NextResponse } from 'next/server';
import { getGsocProjects } from '@/lib/gsoc-projects';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') ?? '';
  const year = Number(url.searchParams.get('year'));
  const r = await getGsocProjects(slug, year);
  if (!r.ok) return NextResponse.json(r, { status: r.reason === 'unavailable' ? 503 : 404 });
  return NextResponse.json(r, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } });
}
