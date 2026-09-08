import {
  MAX_TURNS,
  buildContextBlock,
  buildSystemPrompt,
  getAssistantIdentity,
  isAssistantDisabled,
  isProviderConfigured,
  streamCompletion,
  validateMessages,
} from '@/lib/assistant';
import { checkRateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';
import { logEvent } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

// Guests: 5/day (no GitHub fetch, generic answers). Signed-in: 10/min burst + 100/day.
const GUEST_DAILY = 5;
const USER_BURST = 10;
const USER_DAILY = 100;

export async function POST(request: Request) {
  if (isAssistantDisabled()) {
    return Response.json({ error: 'The assistant is temporarily unavailable.' }, { status: 503 });
  }
  if (!isProviderConfigured()) {
    return Response.json({ error: 'The assistant is not configured on this deployment.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const validated = validateMessages(body);
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const identity = await getAssistantIdentity();

  // Rate limits run BEFORE any GitHub or LLM spend (LLM10 / issue #45).
  if (!identity.username) {
    const guest = await checkRateLimit(`rl:assistant:guest:${getClientIp(request)}`, GUEST_DAILY, 24 * 60 * 60);
    if (!guest.allowed) {
      return rateLimitedResponse(
        guest.retryAfter,
        `Guest limit reached (${GUEST_DAILY}/day). Sign in with GitHub for more.`
      );
    }
  } else {
    const burst = await checkRateLimit(`rl:assistant:burst:${identity.username}`, USER_BURST, 60);
    if (!burst.allowed) return rateLimitedResponse(burst.retryAfter);
    const daily = await checkRateLimit(`rl:assistant:daily:${identity.username}`, USER_DAILY, 24 * 60 * 60);
    if (!daily.allowed) {
      return rateLimitedResponse(daily.retryAfter, `Daily assistant limit reached (${USER_DAILY}/day).`);
    }
  }

  const contextBlock = await buildContextBlock(identity);
  const system = buildSystemPrompt(contextBlock);

  try {
    const stream = await streamCompletion(system, validated.messages);
    await logEvent(
      'assistant',
      'assistant.request',
      identity.username ? `user=${identity.username} turns=${validated.messages.length}` : `guest turns=${validated.messages.length}`
    );
    return stream;
  } catch (error) {
    console.error('[assistant] provider failure:', error);
    return Response.json({ error: 'The assistant failed to respond. Please try again.' }, { status: 502 });
  }
}

// GET documents the endpoint for humans/curl; keeps MAX_TURNS referenced.
export async function GET() {
  if (isAssistantDisabled()) {
    return Response.json({ error: 'The assistant is temporarily unavailable.' }, { status: 503 });
  }
  return Response.json({
    usage: 'POST { messages: [{ role: "user"|"assistant", content: string }] }',
    limits: { maxTurns: MAX_TURNS, guestPerDay: GUEST_DAILY, userPerMinute: USER_BURST, userPerDay: USER_DAILY },
  });
}
