import { getViewer } from '@/lib/session';
import { getClientIp } from '@/lib/rate-limit';
import { getPublicOrigin } from '@/lib/request-origin';
import { isSameOrigin } from '@/lib/same-origin';
import { isBot, normalizePath, recordPageview, referrerHost, visitorKey } from '@/lib/usage';

export const dynamic = 'force-dynamic';

const DONE = () => new Response(null, { status: 204 });

/**
 * POST /api/usage — one page view, sent by UsageBeacon from the reader's
 * browser. Always answers 204: the page must never wait on, or learn
 * anything from, its own bookkeeping. See lib/usage.ts for what is kept.
 */
export async function POST(request: Request) {
  try {
    const userAgent = request.headers.get('user-agent') ?? '';
    if (isBot(userAgent) || !isSameOrigin(request)) return DONE();

    const raw = await request.text();
    if (raw.length > 4000) return DONE();
    const body = JSON.parse(raw) as { p?: unknown; r?: unknown; v?: unknown; n?: unknown };

    const path = normalizePath(body.p);
    if (!path) return DONE();

    const session = await getViewer(request);
    await recordPageview({
      path,
      visitor: visitorKey(body.v, getClientIp(request), userAgent),
      userId: session.status === 'authenticated' ? session.viewer.id : null,
      referrer: referrerHost(body.r, new URL(getPublicOrigin(request)).host),
      firstVisit: body.n === true,
    });
  } catch {
    // Malformed body or a store hiccup: a lost count, nothing more.
  }
  return DONE();
}
