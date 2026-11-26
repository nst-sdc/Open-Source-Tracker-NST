import { getClientIp, checkRateLimit } from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/same-origin';
import { isBot, isInterestEvent, recordInterestEvent, visitorKey } from '@/lib/usage';

export const dynamic = 'force-dynamic';

const DONE = () => new Response(null, { status: 204 });

/**
 * POST /api/interest/event — one funnel event from the interest form
 * ({ e: event, v: visitor id }). Always 204; the page never waits on or
 * learns from its own bookkeeping. Events outside lib/usage.ts's closed
 * list are dropped. Registered/updated are counted server-side instead.
 */
export async function POST(request: Request) {
  try {
    const userAgent = request.headers.get('user-agent') ?? '';
    if (isBot(userAgent) || !isSameOrigin(request)) return DONE();
    const limited = await checkRateLimit(`rl:interest-event:${getClientIp(request)}`, 60, 60);
    if (!limited.allowed) return DONE();
    const raw = await request.text();
    if (raw.length > 500) return DONE();
    const body = JSON.parse(raw) as { e?: unknown; v?: unknown };
    if (!isInterestEvent(body.e) || body.e === 'registered' || body.e === 'updated') return DONE();
    await recordInterestEvent(body.e, visitorKey(body.v, getClientIp(request), userAgent));
  } catch {
    // Malformed body or a store hiccup: a lost count, nothing more.
  }
  return DONE();
}
