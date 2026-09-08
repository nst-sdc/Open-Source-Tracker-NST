/**
 * lib/agent-events.ts — the wire protocol between POST /api/agent and the
 * Kairi console, plus the parser the browser uses to read it.
 *
 * The agent can spend a minute reading a repository, searching the web and
 * composing an answer. Sending nothing until the end made that minute feel
 * like a hang, and behind the Cloudflare Tunnel (which cuts idle connections
 * at ~100s) it was also the single most likely way for a long run to be lost.
 * So the route now streams `text/event-stream`: one event per tool start and
 * finish, then the answer as it is written, then a terminal `done`.
 *
 * Kept free of React and of `next/*` imports so both the Route Handler and
 * the client component can import it, and so it is unit-testable in node.
 */

export type AgentEvent =
  /** A short human phrase for what the agent is doing right now. */
  | { type: 'status'; text: string }
  /** A tool was dispatched. `label` is the human sentence the UI shows. */
  | { type: 'tool_start'; id: string; name: string; label: string }
  /** The tool returned. `ok` false means it reported a problem in words. */
  | { type: 'tool_end'; id: string; name: string; ok: boolean; ms: number }
  /** A slice of the final answer, in order. Concatenate to rebuild it. */
  | { type: 'delta'; text: string }
  /** The run is over. `reply` is authoritative — it may differ from the
   *  concatenated deltas when the guardrail withdrew the answer. */
  | {
      type: 'done';
      reply: string;
      toolsUsed: string[];
      iterations: number;
      sessionId: string;
      sessionTitle: string;
      remembered: boolean;
      engine: 'rust' | 'ts';
      ms: number;
    }
  /** The run failed. Same `code` vocabulary as the JSON error responses. */
  | { type: 'error'; code: string; error: string; retryAfter?: number };

export type AgentEventType = AgentEvent['type'];

/** Serialises one event as an SSE frame. */
export function encodeAgentEvent(event: AgentEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** A comment frame: keeps proxies from timing out an idle connection. */
export const SSE_KEEPALIVE = ': keepalive\n\n';

const KNOWN: ReadonlySet<string> = new Set<AgentEventType>([
  'status',
  'tool_start',
  'tool_end',
  'delta',
  'done',
  'error',
]);

/**
 * Narrows a decoded frame to an AgentEvent. Anything with an unknown type or
 * a missing field is dropped rather than half-applied: a malformed `done`
 * that still flipped the UI to "finished" would strand the student.
 */
export function parseAgentEvent(raw: unknown): AgentEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.type !== 'string' || !KNOWN.has(e.type)) return null;
  switch (e.type as AgentEventType) {
    case 'status':
      return typeof e.text === 'string' ? { type: 'status', text: e.text } : null;
    case 'delta':
      return typeof e.text === 'string' ? { type: 'delta', text: e.text } : null;
    case 'tool_start':
      return typeof e.id === 'string' && typeof e.name === 'string' && typeof e.label === 'string'
        ? { type: 'tool_start', id: e.id, name: e.name, label: e.label }
        : null;
    case 'tool_end':
      return typeof e.id === 'string' && typeof e.name === 'string'
        ? {
            type: 'tool_end',
            id: e.id,
            name: e.name,
            ok: e.ok !== false,
            ms: typeof e.ms === 'number' ? e.ms : 0,
          }
        : null;
    case 'done':
      if (typeof e.reply !== 'string' || typeof e.sessionId !== 'string') return null;
      return {
        type: 'done',
        reply: e.reply,
        toolsUsed: Array.isArray(e.toolsUsed)
          ? e.toolsUsed.filter((t): t is string => typeof t === 'string')
          : [],
        iterations: typeof e.iterations === 'number' ? e.iterations : 0,
        sessionId: e.sessionId,
        sessionTitle: typeof e.sessionTitle === 'string' ? e.sessionTitle : '',
        remembered: e.remembered !== false,
        engine: e.engine === 'rust' ? 'rust' : 'ts',
        ms: typeof e.ms === 'number' ? e.ms : 0,
      };
    case 'error':
      return typeof e.error === 'string'
        ? {
            type: 'error',
            code: typeof e.code === 'string' ? e.code : 'error',
            error: e.error,
            ...(typeof e.retryAfter === 'number' ? { retryAfter: e.retryAfter } : {}),
          }
        : null;
  }
  return null;
}

export interface AgentEventParser {
  /** Feed decoded text in order; returns the complete events it contained. */
  push(chunk: string): AgentEvent[];
}

/**
 * Line-buffering parser for the stream above. Frames are separated by a
 * blank line; the `data:` payload is the whole event, so the `event:` line
 * is informational and a frame that lacks it still parses.
 */
export function createAgentEventParser(): AgentEventParser {
  let buffer = '';
  return {
    push(chunk: string): AgentEvent[] {
      buffer += chunk;
      const out: AgentEvent[] = [];
      for (;;) {
        const sep = buffer.indexOf('\n\n');
        if (sep < 0) break;
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!data) continue; // comment / keepalive
        try {
          const event = parseAgentEvent(JSON.parse(data));
          if (event) out.push(event);
        } catch {
          // A partial or malformed frame is dropped; the terminal `done`
          // carries the authoritative reply, so nothing is lost silently.
        }
      }
      return out;
    },
  };
}

/**
 * Drains a response body, invoking `onEvent` for every event in order.
 * `stream: true` on the decoder keeps a multi-byte character that straddles
 * two chunks intact.
 */
export async function readAgentEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createAgentEventParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) onEvent(event);
  }
  for (const event of parser.push(decoder.decode())) onEvent(event);
}

/**
 * Human labels for tool activity, shown live while the tool runs and in the
 * trail under the finished answer. Present tense while running; the console
 * rewrites to past tense once `tool_end` arrives.
 */
export const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  get_my_standing: { running: 'Checking your standing', done: 'checked your standing' },
  my_recent_prs: { running: 'Looking up your pull requests', done: 'looked up your pull requests' },
  my_recent_commits: { running: 'Looking up your recent commits', done: 'looked up your recent commits' },
  explain_flag: { running: 'Looking up why that PR was flagged', done: 'looked up a flagged PR' },
  find_good_first_issues: { running: 'Searching GitHub for beginner issues', done: 'searched for beginner issues' },
  lookup_contributor: { running: 'Looking up a GitHub profile', done: 'looked up a GitHub profile' },
  compare_contributors: { running: 'Comparing contributors', done: 'compared contributors' },
  site_help: { running: 'Reading the site guide', done: 'read the site guide' },
  search_site_docs: { running: 'Searching the site guide', done: 'searched the site guide' },
  find_repo_issues: { running: 'Reading the open issues in that repo', done: 'read the open issues in that repo' },
  read_issue: { running: 'Reading the issue', done: 'read the issue' },
  explain_repo: { running: 'Studying how that repo works', done: 'studied how that repo works' },
  repo_overview: { running: 'Skimming that repo’s documentation', done: 'skimmed that repo’s documentation' },
  web_search: { running: 'Searching the web', done: 'searched the web' },
  read_url: { running: 'Reading a web page', done: 'read a web page' },
};

export function toolLabel(name: string, state: 'running' | 'done'): string {
  const known = TOOL_LABELS[name];
  if (known) return known[state];
  const plain = name.replace(/_/g, ' ');
  return state === 'running' ? `Running ${plain}` : `ran ${plain}`;
}
