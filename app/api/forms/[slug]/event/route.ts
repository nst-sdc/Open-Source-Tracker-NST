import { getClientIp, checkRateLimit } from '@/lib/rate-limit';
import { isSameOrigin } from '@/lib/same-origin';
import { isBot, isFormEvent, recordFormEvent, visitorKey } from '@/lib/usage';

export const dynamic = 'force-dynamic';

const DONE = () => new Response(null, { status: 204 });
const SLUG = /^[a-z0-9-]{1,64}$/;

/**
 * POST /api/forms/<slug>/event — one funnel event from a form page
 * ({ e: event, v: visitor id }). Always 204; the page never waits on or
 * learns from its own bookkeeping. Events outside lib/usage.ts's closed
 * list are dropped; registered/updated are counted server-side instead.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!SLUG.test(slug)) return DONE();
    const userAgent = request.headers.get('user-agent') ?? '';
    if (isBot(userAgent) || !isSameOrigin(request)) return DONE();
    // Per address, and a campus is one address: wide enough for a lecture hall opening the form at once.
    const limited = await checkRateLimit(`rl:form-event:${getClientIp(request)}`, 1200, 60);
    if (!limited.allowed) return DONE();
    const raw = await request.text();
    if (raw.length > 500) return DONE();
    const body = JSON.parse(raw) as { e?: unknown; v?: unknown };
    if (!isFormEvent(body.e) || body.e === 'registered' || body.e === 'updated') return DONE();
    await recordFormEvent(slug, body.e, visitorKey(body.v, getClientIp(request), userAgent));
  } catch {
    // Malformed body or a store hiccup: a lost count, nothing more.
  }
  return DONE();
}
