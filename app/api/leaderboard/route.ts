import { NextResponse } from 'next/server';
import { buildLeaderboard, parseLeaderboardQuery, pageOf, PAGE_SIZE } from '@/lib/leaderboard';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leaderboard?section=active|other&offset=50&limit=50&period=…&search=…&org=…&year=…&campus=…
 *
 * The next page of the leaderboard the reader is scrolling, for the same
 * filters the page was rendered with. 50 slim rows per call instead of the
 * whole roster in the page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Scrolling to the bottom of the full list is ~45 calls; a browser never
  // needs more than a couple per second.
  const limited = await checkRateLimit(`rl:leaderboard:${getClientIp(request)}`, 240, 60);
  if (!limited.allowed) return rateLimitedResponse(limited.retryAfter);

  const params = Object.fromEntries(url.searchParams.entries());
  const section = params.section === 'other' ? 'other' : 'active';
  const offset = Number(params.offset ?? 0);
  const limit = Number(params.limit ?? PAGE_SIZE);
  if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(limit) || limit < 1) {
    return NextResponse.json({ error: 'offset and limit must be non-negative numbers' }, { status: 400 });
  }

  const board = await buildLeaderboard(parseLeaderboardQuery(params));
  const page = pageOf(section === 'other' ? board.other : board.active, offset, limit);
  return NextResponse.json(
    { section, ...page },
    {
      headers: {
        // Short shared cache: the data behind it changes on the refresh
        // cycle, not per request, and it is identical for every reader.
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
      },
    },
  );
}
