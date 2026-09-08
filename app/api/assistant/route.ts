import {
  MAX_TURNS,
  buildContextBlock,
  buildSystemPrompt,
  isAssistantDisabled,
  isProviderConfigured,
  streamCompletion,
  validateMessages,
} from '@/lib/assistant';
import { getViewer, getViewerToken } from '@/lib/session';
import { isSameOrigin } from '@/lib/same-origin';
import { CHAT_USER_BURST, CHAT_USER_DAILY, reserveProviderCalls } from '@/lib/llm-budget';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { logEvent } from '@/lib/audit-log';
import {
  BLOCKED_REQUEST_MESSAGE,
  REINFORCEMENT,
  assessUserMessage,
  stripInvisible,
} from '@/lib/prompt-safety';

export const dynamic = 'force-dynamic';

const DAY_SECONDS = 24 * 60 * 60;

/** Machine-readable reason alongside the human string the widget shows. */
function fail(code: string, error: string, status: number): Response {
  return Response.json({ code, error }, { status });
}

export async function POST(request: Request) {
  // Gate order is deliberate: cheapest and least abusable first, so an
  // unauthenticated caller can neither spend money nor probe the validator.
  if (isAssistantDisabled()) {
    return fail('assistant_disabled', 'The assistant is temporarily unavailable.', 503);
  }
  if (!isProviderConfigured()) {
    return fail('assistant_disabled', 'The assistant is not configured on this deployment.', 503);
  }
  if (!isSameOrigin(request)) {
    return fail('bad_origin', 'This request did not come from the tracker.', 403);
  }

  const session = await getViewer(request);
  if (session.status === 'unavailable') {
    return fail('auth_unavailable', 'We could not reach GitHub to check your sign-in. Try again in a moment.', 503);
  }
  if (session.status === 'anonymous') {
    return fail('auth_required', 'Sign in with GitHub to use the assistant.', 401);
  }
  if (session.status === 'invalid') {
    return fail('auth_expired', 'Your GitHub sign-in expired. Sign in again to continue.', 401);
  }
  const { viewer } = session;

  // Limits key on the immutable numeric GitHub id, never the login: a
  // username rename must not mint a fresh quota.
  const burst = await checkRateLimit(`rl:assistant:burst:${viewer.id}`, CHAT_USER_BURST, 60);
  if (!burst.allowed) return rateLimitedResponse(burst.retryAfter);
  const daily = await checkRateLimit(`rl:assistant:daily:${viewer.id}`, CHAT_USER_DAILY, DAY_SECONDS);
  if (!daily.allowed) {
    return rateLimitedResponse(daily.retryAfter, `Daily assistant limit reached (${CHAT_USER_DAILY}/day).`);
  }
  const budget = await reserveProviderCalls(1);
  if (!budget.allowed) {
    return rateLimitedResponse(
      budget.retryAfter,
      budget.scope === 'day'
        ? 'The assistant has used up today’s shared AI budget. It resets tomorrow.'
        : 'The assistant is busy right now. Try again in a few seconds.',
    );
  }

  // Body parsing happens after auth so unauthenticated callers cannot probe
  // the validator for free.
  const body = await request.json().catch(() => null);
  const validated = validateMessages(body);
  if (!validated.ok) {
    return fail('bad_request', validated.error, 400);
  }

  // Invisible characters never reach the model, and the last turn is
  // screened for jailbreak patterns before a provider call is made.
  const messages = validated.messages.map((m) => ({ ...m, content: stripInvisible(m.content) }));
  const safety = assessUserMessage(messages[messages.length - 1]?.content ?? '');
  if (safety.verdict === 'block') {
    await logEvent(
      'assistant',
      'assistant.prompt_safety.block',
      `user=${viewer.login} id=${viewer.id} score=${safety.score} categories=${safety.categories.join(',')}`,
    );
    const strikes = await checkRateLimit(`rl:assistant:jailbreak:${viewer.id}`, 5, 15 * 60);
    if (!strikes.allowed) {
      return rateLimitedResponse(strikes.retryAfter, 'Too many blocked requests. Try again later.');
    }
    return fail('blocked_request', BLOCKED_REQUEST_MESSAGE, 400);
  }

  const token = await getViewerToken();
  const contextBlock = await buildContextBlock({ username: viewer.login, token });
  const system =
    buildSystemPrompt(contextBlock) + (safety.verdict === 'harden' ? `\n\n${REINFORCEMENT}` : '');

  try {
    const stream = await streamCompletion(system, messages);
    await logEvent(
      'assistant',
      'assistant.request',
      `user=${viewer.login} id=${viewer.id} turns=${messages.length}` +
        (safety.categories.length ? ` risk=${safety.verdict}:${safety.categories.join(',')}` : ''),
    );
    return stream;
  } catch (error) {
    console.error('[assistant] provider failure:', error);
    return fail('provider_error', 'The assistant failed to respond. Please try again.', 502);
  }
}

// GET documents the endpoint for humans/curl; keeps MAX_TURNS referenced.
export async function GET() {
  if (isAssistantDisabled()) {
    return Response.json({ error: 'The assistant is temporarily unavailable.' }, { status: 503 });
  }
  return Response.json({
    usage: 'POST { messages: [{ role: "user"|"assistant", content: string }] } — requires a signed-in GitHub session',
    auth: 'required',
    limits: { maxTurns: MAX_TURNS, userPerMinute: CHAT_USER_BURST, userPerDay: CHAT_USER_DAILY },
  });
}
