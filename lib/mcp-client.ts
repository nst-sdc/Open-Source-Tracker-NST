/**
 * lib/mcp-client.ts — minimal client for hosted MCP servers over HTTP.
 *
 * Two services use this: DeepWiki (repository comprehension) and Parallel
 * (web search and fetch). Both are keyless, both speak "streamable HTTP" —
 * a single POST whose response is either plain JSON or an SSE stream carrying
 * one JSON-RPC message per `data:` line.
 *
 * Deliberately not a full MCP implementation: no session negotiation, no
 * capability exchange, no notifications. Every call is self-contained, which
 * is all a stateless Route Handler can use and all these two servers require.
 *
 * TRUST: everything returned here is third-party content — a stranger's web
 * page, a summary of a repository anyone can edit. It is untrusted input in
 * the OWASP LLM01 sense. Callers MUST wrap it before it reaches a model, and
 * this module never sends credentials, cookies or caller identity upstream.
 */

/** Ceiling on the raw HTTP body we will buffer before parsing. */
const MAX_BODY_BYTES = 512 * 1024;

export type McpFailure = 'unavailable' | 'rejected';

export type McpResult =
  | { ok: true; text: string; structured: Record<string, unknown> | null }
  | { ok: false; reason: McpFailure; detail: string };

/** Reads a bounded amount of a response body. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let out = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BODY_BYTES) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out;
}

/**
 * Pulls the JSON-RPC message out of a response body, accepting either plain
 * JSON or SSE framing. Servers are free to choose per request, so we cannot
 * decide from the Content-Type alone.
 */
function parseEnvelope(body: string): Record<string, unknown> | null {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      /* fall through to SSE parsing */
    }
  }
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const msg = JSON.parse(payload) as Record<string, unknown>;
      if ('result' in msg || 'error' in msg) return msg;
    } catch {
      /* ignore keep-alives and partial frames */
    }
  }
  return null;
}

/** Concatenates the text parts of an MCP tool result. */
function extractText(result: Record<string, unknown>): string {
  const content = result.content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>).text : null))
    .filter((t): t is string => typeof t === 'string')
    .join('\n');
}

export interface McpCallOptions {
  /** Wall-clock ceiling for this call. */
  timeoutMs: number;
  /** Label used in logs so a failure names the service, not just a URL. */
  label: string;
}

/**
 * Calls one tool on a hosted MCP server.
 *
 * Returns `structured` when the server sends `structuredContent` (Parallel
 * does, and it is far easier to work with than re-parsing the text form) and
 * `text` always, so callers can pick whichever the service actually provides.
 */
export async function callMcpTool(
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>,
  opts: McpCallOptions,
): Promise<McpResult> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // These servers reject a request that does not advertise both.
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
      // No credentials, and no following a redirect somewhere else.
      redirect: 'error',
    });
  } catch (error) {
    console.warn(`[mcp:${opts.label}] request failed:`, error);
    return { ok: false, reason: 'unavailable', detail: 'The service did not respond in time.' };
  }

  if (!res.ok) {
    console.warn(`[mcp:${opts.label}] returned HTTP ${res.status}`);
    return { ok: false, reason: 'unavailable', detail: `The service returned ${res.status}.` };
  }

  const msg = parseEnvelope(await readCapped(res));
  if (!msg) {
    return { ok: false, reason: 'unavailable', detail: 'The service sent an unreadable response.' };
  }
  if (msg.error) {
    console.warn(`[mcp:${opts.label}] JSON-RPC error:`, JSON.stringify(msg.error).slice(0, 300));
    return { ok: false, reason: 'rejected', detail: 'The service rejected the request.' };
  }

  const result = (msg.result ?? null) as Record<string, unknown> | null;
  if (!result || typeof result !== 'object') {
    return { ok: false, reason: 'unavailable', detail: 'The service sent an empty response.' };
  }

  const structured =
    result.structuredContent && typeof result.structuredContent === 'object'
      ? (result.structuredContent as Record<string, unknown>)
      : null;

  return { ok: true, text: extractText(result), structured };
}

/**
 * Trims text to a character budget, preferring a paragraph boundary so the
 * model does not receive a sentence cut mid-word and try to finish it.
 *
 * This is a budget control, not cosmetics: lib/agent-loop.ts re-sends the
 * whole wire array on every iteration, so R characters of tool output are
 * billed R times over the remaining iterations.
 */
export function truncateForModel(text: string, limit: number): { text: string; truncated: boolean } {
  const clean = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= limit) return { text: clean, truncated: false };
  const slice = clean.slice(0, limit);
  const lastBreak = slice.lastIndexOf('\n\n');
  const cut = lastBreak > limit * 0.6 ? slice.slice(0, lastBreak) : slice;
  return { text: cut, truncated: true };
}
