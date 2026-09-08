/**
 * POST /api/agent — tool-using agent (issue #43 follow-up).
 *
 * Sign-in required. Two response shapes, chosen by the Accept header:
 *
 *   Accept: text/event-stream  → progress events (lib/agent-events.ts): tool
 *                                activity as it happens, the answer as it is
 *                                written, then a terminal `done` or `error`.
 *   anything else              → one JSON object once the run is complete,
 *                                for curl and for the tests.
 *
 * Everything that can refuse a request — kill switch, origin, session, rate
 * limits, budget, body validation — happens BEFORE the response starts, so a
 * refusal is always a plain JSON status the client can branch on. Only the
 * run itself streams; a failure mid-run arrives as an `error` event.
 *
 * Limits are tighter than the chat route because one agent request can cost
 * up to MAX_ITERATIONS provider calls plus MAX_TOOL_CALLS GitHub calls, and
 * the whole deployment shares one provider budget.
 */
import { MAX_TURNS, isAssistantDisabled, validateMessages, type ChatMessage } from '@/lib/assistant';
import { MAX_ITERATIONS, MAX_TOOL_CALLS, guardReply, isAgentProviderConfigured, runAgent, type AgentRunResult } from '@/lib/agent-loop';
import { TOOLS } from '@/lib/agent-tools';
import { getViewer, getViewerToken } from '@/lib/session';
import { isSameOrigin } from '@/lib/same-origin';
import {
  AGENT_USER_BURST,
  AGENT_USER_DAILY,
  refundProviderCalls,
  reserveProviderCalls,
} from '@/lib/llm-budget';
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit';
import { logEvent } from '@/lib/audit-log';
import { wrapRetrievedData } from '@/lib/assistant-guardrails';
import { describeStanding, getStanding } from '@/lib/student-context';
import {
  appendExchange,
  describeMemory,
  forHistory,
  isValidSessionId,
  loadSession,
  newSession,
  saveSession,
  type AgentSession,
} from '@/lib/agent-memory';
import { normalizeRepoName } from '@/lib/deepwiki';
import { SSE_KEEPALIVE, encodeAgentEvent, type AgentEvent } from '@/lib/agent-events';
import {
  BLOCKED_REQUEST_MESSAGE,
  REINFORCEMENT,
  assessUserMessage,
  stripInvisible,
} from '@/lib/prompt-safety';

export const dynamic = 'force-dynamic';

const DAY_SECONDS = 24 * 60 * 60;

/**
 * The Cloudflare Tunnel in front of the cluster cuts connections at ~100s
 * (see lib/github.ts and k8s/02-deployment.yaml). Our own budget must stay
 * under it, or a long run 524s in the student's browser while the server
 * happily finishes work nobody will ever see.
 */
const SIDECAR_TIMEOUT_MS = 85_000;

/**
 * A comment frame every 15s while a tool is still running. Cloudflare's
 * tunnel and most corporate proxies drop a connection that has been silent
 * for a minute or two; a DeepWiki call alone can take twenty seconds.
 */
const KEEPALIVE_MS = 15_000;

function wantsStream(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('text/event-stream');
}

/** Maps a thrown run failure to the same code/message pair in both shapes. */
function describeFailure(error: unknown): { code: string; error: string; status: number; retryAfter?: number } {
  // The provider's own ceiling is the limit this deployment hits first.
  // Reporting that as a 502 "failed to respond" tells the student to retry
  // immediately, which is both wrong and the worst possible advice.
  if (/\b429\b|rate limit/i.test(error instanceof Error ? error.message : String(error))) {
    return {
      code: 'rate_limited',
      error: 'The shared AI budget is momentarily exhausted. Try again in a minute.',
      status: 429,
      retryAfter: 60,
    };
  }
  return { code: 'provider_error', error: 'The agent failed to respond. Please try again.', status: 502 };
}

function fail(code: string, error: string, status: number): Response {
  return Response.json({ code, error }, { status });
}

/**
 * Pulls a repository out of what the student typed, so "can you look at
 * https://github.com/facebook/react" sets the working repo for the rest of
 * the chat without them having to repeat it.
 *
 * Deliberately conservative: it only matches a github.com URL or an explicit
 * owner/repo token. Guessing more aggressively would latch onto things like
 * "and/or" and then confidently answer about a repository nobody mentioned.
 */
function extractRepo(text: string): string | null {
  if (!text) return null;
  const url = text.match(/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i);
  if (url) return normalizeRepoName(url[0]);
  const bare = text.match(/(?:^|\s)([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*)(?=$|[\s,.;:!?])/);
  return bare ? normalizeRepoName(bare[1]) : null;
}

/**
 * The sidecar receives the caller's OAuth token, so where it points is a
 * credential-disclosure decision, not a config convenience. Loopback only:
 * agent-rs is designed to run beside the app and binds to localhost.
 */
function sidecarUrl(): string | null {
  const base = process.env.RUST_AGENT_URL;
  if (!base) return null;
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    console.error('[agent] RUST_AGENT_URL is not a valid URL; ignoring sidecar');
    return null;
  }
  const host = parsed.hostname;
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (!isLoopback) {
    console.error(`[agent] refusing to forward a user token to non-loopback RUST_AGENT_URL host "${host}"`);
    return null;
  }
  if (!process.env.AGENT_SHARED_SECRET) {
    // Without the shared secret the sidecar call is unauthenticated; a
    // missing env var must not silently downgrade the trust boundary.
    console.error('[agent] RUST_AGENT_URL is set but AGENT_SHARED_SECRET is missing; ignoring sidecar');
    return null;
  }
  return base.replace(/\/$/, '');
}

/**
 * When a validated RUST_AGENT_URL is set, the loop runs in the agent-rs
 * sidecar (BM25 doc retrieval + tool dispatch in-process). This layer stays
 * the trust boundary either way: session, rate limits, kill switch and audit
 * never leave Next.js. Returns null when the sidecar is unconfigured or down
 * so the TypeScript loop can serve the request instead.
 */
async function callRustAgent(
  messages: ChatMessage[],
  username: string,
  githubToken: string | null,
  requestId: string,
  extraContext: string,
): Promise<AgentRunResult | null> {
  const base = sidecarUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/v1/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-secret': process.env.AGENT_SHARED_SECRET as string,
      },
      body: JSON.stringify({
        messages,
        username,
        github_token: githubToken,
        request_id: requestId,
        // Without this the sidecar would answer without the student's
        // standing or this chat's memory, and the loss would be invisible.
        extra_context: extraContext,
      }),
      signal: AbortSignal.timeout(SIDECAR_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`sidecar status ${res.status}`);
    const data = (await res.json()) as { reply?: unknown; tools_used?: unknown; iterations?: unknown };
    if (typeof data.reply !== 'string' || data.reply.length === 0) {
      throw new Error('sidecar returned a malformed reply');
    }
    return {
      reply: data.reply,
      toolsUsed: Array.isArray(data.tools_used)
        ? data.tools_used.filter((t): t is string => typeof t === 'string')
        : [],
      iterations: typeof data.iterations === 'number' ? data.iterations : 0,
    };
  } catch (error) {
    console.warn(`[agent] rust sidecar unavailable (req=${requestId}), using TS loop:`, error);
    return null;
  }
}

export async function POST(request: Request) {
  if (isAssistantDisabled()) {
    return fail('assistant_disabled', 'The assistant is temporarily unavailable.', 503);
  }
  if (!isAgentProviderConfigured()) {
    return fail('assistant_disabled', 'The agent is not configured on this deployment.', 503);
  }
  if (!isSameOrigin(request)) {
    return fail('bad_origin', 'This request did not come from the tracker.', 403);
  }

  const session = await getViewer(request);
  if (session.status === 'unavailable') {
    return fail('auth_unavailable', 'We could not reach GitHub to check your sign-in. Try again in a moment.', 503);
  }
  if (session.status === 'anonymous') {
    return fail('auth_required', 'Sign in with GitHub to use the agent.', 401);
  }
  if (session.status === 'invalid') {
    return fail('auth_expired', 'Your GitHub sign-in expired. Sign in again to continue.', 401);
  }
  const { viewer } = session;

  // Keyed on the immutable numeric id, so renaming cannot mint fresh quota.
  const burst = await checkRateLimit(`rl:agent:burst:${viewer.id}`, AGENT_USER_BURST, 60);
  if (!burst.allowed) {
    return rateLimitedResponse(
      burst.retryAfter,
      `That is ${AGENT_USER_BURST} questions inside a minute. Give it about ${burst.retryAfter} seconds and ask again.`,
    );
  }
  const daily = await checkRateLimit(`rl:agent:daily:${viewer.id}`, AGENT_USER_DAILY, DAY_SECONDS);
  if (!daily.allowed) {
    return rateLimitedResponse(daily.retryAfter, `Daily agent limit reached (${AGENT_USER_DAILY}/day).`);
  }
  // Reserve the worst case up front. Charging only for calls already made
  // cannot prevent the overspend the ceiling exists to prevent.
  const budget = await reserveProviderCalls(MAX_ITERATIONS);
  if (!budget.allowed) {
    return rateLimitedResponse(
      budget.retryAfter,
      budget.scope === 'day'
        ? 'The agent has used up today’s shared AI budget. It resets tomorrow.'
        : 'The agent is busy right now. Try again in a few seconds.',
    );
  }

  const body = await request.json().catch(() => null);
  const validated = validateMessages(body);
  if (!validated.ok) {
    // The reservation above already charged the worst case to the day's
    // counter. Returning here without handing it back would let a stream of
    // malformed requests burn the whole shared budget — ~200 of them against
    // the default ceiling of 800 — without ever reaching the provider.
    await refundProviderCalls(MAX_ITERATIONS);
    return fail('bad_request', validated.error, 400);
  }

  // The chat this turn belongs to. The client supplies only the id; the
  // lookup is namespaced under the caller's verified GitHub id, so an id
  // belonging to another student resolves to nothing rather than to their
  // conversation. An absent or unknown id simply starts a new chat.
  const requestedId = (body as { sessionId?: unknown } | null)?.sessionId;
  const latest = validated.messages[validated.messages.length - 1];
  // Invisible characters are stripped before the text reaches the model, is
  // stored, or is scored: a payload the detector cannot see is one the model
  // should not receive either.
  const userText = latest?.role === 'user' ? stripInvisible(latest.content) : '';

  // Input-side jailbreak screen. This runs before any provider call, so a
  // refused turn costs nothing; the reservation taken above is handed back.
  const safety = assessUserMessage(userText);
  if (safety.verdict === 'block') {
    await refundProviderCalls(MAX_ITERATIONS);
    await logEvent(
      'agent',
      'agent.prompt_safety.block',
      `user=${viewer.login} id=${viewer.id} score=${safety.score} categories=${safety.categories.join(',')}`,
    );
    // Repeat offenders get a cooldown. One curious probe is not abuse; a
    // stream of them is someone working through a jailbreak list, and each
    // attempt still costs us a session lookup and a KV write.
    const strikes = await checkRateLimit(`rl:agent:jailbreak:${viewer.id}`, 5, 15 * 60);
    if (!strikes.allowed) {
      return rateLimitedResponse(strikes.retryAfter, 'Too many blocked requests. Try again later.');
    }
    return fail('blocked_request', BLOCKED_REQUEST_MESSAGE, 400);
  }

  let chat: AgentSession | null = null;
  if (isValidSessionId(requestedId)) {
    chat = await loadSession(viewer.id, requestedId);
  }
  const isNewSession = !chat;
  if (!chat) chat = newSession(userText);

  // If the student named a repository this turn, that is the thing the rest
  // of the conversation is about; remembering it is what stops the agent
  // asking "which repo?" three turns running.
  const mentionedRepo = extractRepo(userText);
  if (mentionedRepo) chat = { ...chat, repo: mentionedRepo };

  const requestId = crypto.randomUUID();
  // The caller's own token — never getGitHubHeaders()'s pool fallback, which
  // would hand a tool (or the sidecar) a different student's credentials.
  const githubToken = await getViewerToken();

  // What Kairi knows about this student and this conversation. Both halves
  // are student- or model-authored text sitting next to instructions, so the
  // untrusted envelope is not optional.
  const standing = await getStanding(viewer.login);
  const memoryText = describeMemory(chat);
  const extraContext = [
    wrapRetrievedData([describeStanding(standing), memoryText].filter(Boolean).join('\n')),
    // Restated immediately before the student's turn, where it is far more
    // effective than the same rule stated once at the top of the prompt.
    safety.verdict === 'harden' ? REINFORCEMENT : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // The transcript the model sees is the server's, not the client's. A client
  // that replays an edited history can no longer put words in its own mouth.
  const priorTurns: ChatMessage[] = chat.messages.map((m) => ({
    role: m.role,
    content: forHistory(m),
  }));
  const conversation: ChatMessage[] = userText
    ? [...priorTurns, { role: 'user', content: userText }]
    : validated.messages;

  const startedAt = Date.now();
  const chatForRun = chat;

  /**
   * The run proper. Shared by both response shapes so the memory write, the
   * budget refund and the audit line cannot drift apart between them.
   * Throws on provider failure; the caller decides how to report it.
   */
  const runTurn = async (onEvent?: (event: AgentEvent) => void): Promise<Omit<Extract<AgentEvent, { type: 'done' }>, 'type'>> => {
    const rustResult = await callRustAgent(
      conversation,
      viewer.login,
      githubToken,
      requestId,
      extraContext,
    );
    const engine = rustResult ? 'rust' : 'ts';
    const result =
      rustResult ??
      (await runAgent({
        messages: conversation,
        username: viewer.login,
        token: githubToken,
        extraContext,
        sessionId: chatForRun.id,
        requestId,
        onEvent,
      }));
    // The output guardrail lives inside runAgent, so a reply produced by the
    // sidecar would otherwise never be checked. Apply it here, where every
    // engine's reply converges, rather than trusting each engine to do it.
    const reply = guardReply(result.reply);

    // Most runs finish in fewer than MAX_ITERATIONS calls; hand the rest of
    // the reservation back so the day's quota reflects real spend.
    await refundProviderCalls(MAX_ITERATIONS - (result.iterations || 0));
    // Persist the exchange so the next turn remembers it. Best-effort: a
    // memory write that fails must not turn a good answer into an error, but
    // the client is told, so the UI can stop pretending the chat is durable.
    const saved = userText
      ? await saveSession(viewer.id, appendExchange(chatForRun, userText, reply))
      : false;

    const usage = result.usage ? ` tokens=${result.usage.promptTokens}+${result.usage.completionTokens}` : '';
    await logEvent(
      'agent',
      'agent.request',
      `user=${viewer.login} id=${viewer.id} engine=${engine} ` +
        `turns=${conversation.length} iterations=${result.iterations} tools=${result.toolsUsed.join(',') || 'none'} ` +
        `session=${isNewSession ? 'new' : 'resumed'} saved=${saved} ms=${Date.now() - startedAt}${usage}` +
        (safety.categories.length ? ` risk=${safety.verdict}:${safety.categories.join(',')}` : ''),
    );
    return {
      reply,
      toolsUsed: result.toolsUsed,
      iterations: result.iterations,
      sessionId: chatForRun.id,
      sessionTitle: chatForRun.title,
      // False means this turn will not be remembered — the KV store is
      // unavailable. The UI says so rather than silently losing the thread.
      remembered: saved,
      // Which engine actually answered. Without this a sidecar failure is
      // invisible (it degrades to the TS loop with only a console.warn), and
      // no manual test of this system means anything.
      engine,
      ms: Date.now() - startedAt,
    };
  };

  const onFailure = async (error: unknown) => {
    // A failed run still consumed something, but rarely the full reservation;
    // refund all but one so a provider outage cannot burn the day's budget.
    await refundProviderCalls(MAX_ITERATIONS - 1);
    // Internals (provider status, config details) stay in the server log only.
    console.error(`[agent] failure req=${requestId}:`, error);
    return describeFailure(error);
  };

  if (!wantsStream(request)) {
    try {
      const done = await runTurn();
      return Response.json(done);
    } catch (error) {
      const failure = await onFailure(error);
      if (failure.status === 429) return rateLimitedResponse(failure.retryAfter ?? 60, failure.error);
      return fail(failure.code, failure.error, failure.status);
    }
  }

  // Streaming shape. Everything that could refuse has already returned a
  // JSON status above; from here the only outcomes are `done` and `error`.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // The student navigated away. The run still finishes so the
          // exchange is remembered and the budget accounted for.
          closed = true;
        }
      };
      const keepalive = setInterval(() => send(SSE_KEEPALIVE), KEEPALIVE_MS);
      try {
        const done = await runTurn((event) => send(encodeAgentEvent(event)));
        send(encodeAgentEvent({ type: 'done', ...done }));
      } catch (error) {
        const failure = await onFailure(error);
        send(
          encodeAgentEvent({
            type: 'error',
            code: failure.code,
            error: failure.error,
            ...(failure.retryAfter ? { retryAfter: failure.retryAfter } : {}),
          }),
        );
      } finally {
        clearInterval(keepalive);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed by the consumer */
          }
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// GET documents the endpoint for humans/curl.
export async function GET() {
  if (isAssistantDisabled()) {
    return Response.json({ error: 'The assistant is temporarily unavailable.' }, { status: 503 });
  }
  return Response.json({
    usage: 'POST { messages: [{ role: "user"|"assistant", content: string }] } — requires a signed-in GitHub session',
    returns:
      '{ reply, toolsUsed, iterations, sessionId, sessionTitle, remembered, engine, ms } — or, with Accept: text/event-stream, a stream of status/tool_start/tool_end/delta events ending in done|error',
    auth: 'required',
    engine: sidecarUrl() ? 'rust (agent-rs sidecar, TS fallback)' : 'ts',
    tools: TOOLS.length,
    limits: {
      maxTurns: MAX_TURNS,
      maxIterations: MAX_ITERATIONS,
      maxToolCalls: MAX_TOOL_CALLS,
      userPerMinute: AGENT_USER_BURST,
      userPerDay: AGENT_USER_DAILY,
    },
  });
}
