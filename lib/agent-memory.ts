/**
 * lib/agent-memory.ts — per-student, per-session memory for Kairi.
 *
 * Every student gets their own chats, and every chat keeps its own context.
 * That is the whole feature; the rest of this file is about making it true
 * even when the student is talking to a different pod each turn.
 *
 * WHY NOT SQLITE. The obvious answer is a SQLite file, and on one machine it
 * would be the right one. It cannot work here: k8s/02-deployment.yaml runs
 * `replicas: 3` (k8s/06-hpa.yaml scales to 8), k8s/03-service.yaml sets no
 * sessionAffinity, and there is no PersistentVolumeClaim anywhere in k8s/.
 * Turn 1 lands on pod A and turn 2 on pod C, so a local file is a memory that
 * loses roughly two thirds of its own writes and all of them on restart. This
 * module therefore stores through lib/kv.ts, which is Upstash Redis in
 * production and JSON files under data/kv/ in single-pod development — the
 * same abstraction the leaderboard cache already relies on.
 *
 * ISOLATION. Every key is namespaced under the caller's *verified* numeric
 * GitHub id (resolved by lib/session.ts from GitHub's own /user endpoint,
 * never from a request body or cookie). A client supplies only the session
 * id; because that id is looked up inside its owner's namespace, guessing or
 * stealing one reaches nothing but the guesser's own sessions. Cross-user
 * reads are structurally impossible rather than checked for.
 */
import { kvDel, kvGet, kvSet } from './kv';

/** Chats expire after a week of silence. Long enough to resume work on a PR
 *  across a weekend; short enough that we are not an indefinite archive of
 *  students' questions. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Turns kept per session. The wire cost of history is paid on every provider
 *  call, and the free tier gives 200,000 tokens per DAY for the whole
 *  deployment (see lib/llm-budget.ts), so this is a budget number. */
export const MAX_TRANSCRIPT_MESSAGES = 12;

/** Sessions listed per student. Beyond this the oldest are forgotten. */
export const MAX_SESSIONS_PER_USER = 20;

export const MAX_MESSAGE_CHARS = 2000;
/**
 * Assistant turns are stored longer than student turns: a structured answer
 * with headings, a code block, sources and a next step is 2,000-5,000
 * characters, and truncating it at 2,000 meant every reopened chat showed
 * answers cut off mid-sentence. The cost is storage only; what is sent
 * back to the model as history is capped separately (HISTORY_ASSISTANT_CHARS).
 */
export const MAX_ASSISTANT_MESSAGE_CHARS = 6000;
/**
 * How much of a past answer the model sees on later turns. History is
 * re-sent on every provider call, so this is a token budget: enough to
 * remember what was said, not enough to replay every code block.
 */
export const HISTORY_ASSISTANT_CHARS = 1500;
const MAX_TITLE_CHARS = 60;

/** Durable notes the agent keeps about a session — the "what are we working
 *  on" that should survive the transcript being trimmed. */
export const MAX_NOTES = 8;
const MAX_NOTE_CHARS = 200;

export interface MemoryMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: MemoryMessage[];
  /** Facts worth carrying forward: the repo in play, the issue claimed, the
   *  goal the student stated. Written by the agent, read into every turn. */
  notes: string[];
  /** Repo the student is currently working on, if they named one. Lets the
   *  agent answer "where is this handled?" without being told again. */
  repo?: string;
}

export interface SessionIndexEntry {
  id: string;
  title: string;
  updatedAt: number;
}

function sessionKey(userId: string | number, sessionId: string): string {
  return `kairi:sess:${userId}:${sessionId}`;
}

function indexKey(userId: string | number): string {
  return `kairi:sessidx:${userId}`;
}

/**
 * Session ids are opaque and server-minted. Validated on the way in because
 * they are interpolated into a KV key: a client-supplied id containing a
 * colon or a wildcard would otherwise be able to reshape the keyspace.
 */
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && SESSION_ID_RE.test(id);
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

/** Strips control characters and clamps length. Applied to everything that
 *  is stored, because all of it is student- or model-authored text. */
function clean(text: unknown, limit: number): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, limit);
}

/**
 * Like `clean`, but keeps newlines and tabs: message bodies are Markdown,
 * and a newline is structure, not noise. Stripping it (as `clean` once did
 * for messages too) turned every reopened answer into one run-on paragraph
 * with its tables and code blocks flattened into it.
 */
function cleanBody(text: unknown, limit: number): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, limit);
}

function messageLimit(role: 'user' | 'assistant'): number {
  return role === 'assistant' ? MAX_ASSISTANT_MESSAGE_CHARS : MAX_MESSAGE_CHARS;
}

/**
 * A past answer as the model should see it on later turns: the opening,
 * which carries the conclusion, and a marker that the rest was elided.
 */
export function forHistory(message: MemoryMessage): string {
  if (message.role !== 'assistant' || message.content.length <= HISTORY_ASSISTANT_CHARS) return message.content;
  return `${message.content.slice(0, HISTORY_ASSISTANT_CHARS)}\n[... rest of the answer omitted from history]`;
}

/**
 * A readable name for a chat, derived from its opening question, so the
 * student's sidebar is not a list of UUIDs.
 */
export function titleFrom(firstMessage: string): string {
  const t = clean(firstMessage, MAX_TITLE_CHARS * 2)
    .replace(/\s+/g, ' ')
    .replace(/^(hi|hey|hello)[,!.\s]+/i, '');
  if (!t) return 'New chat';
  return t.length > MAX_TITLE_CHARS ? `${t.slice(0, MAX_TITLE_CHARS - 1)}…` : t;
}

/** Narrows unknown KV data to a session, discarding anything malformed. */
function parseSession(raw: unknown, id: string): AgentSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const messages = Array.isArray(r.messages)
    ? r.messages
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .map((m) => {
          const role = m.role === 'assistant' ? ('assistant' as const) : ('user' as const);
          return {
            role,
            content: cleanBody(m.content, messageLimit(role)),
            at: typeof m.at === 'number' ? m.at : 0,
          };
        })
        .filter((m) => m.content.length > 0)
        .slice(-MAX_TRANSCRIPT_MESSAGES)
    : [];
  const notes = Array.isArray(r.notes)
    ? r.notes.map((n) => clean(n, MAX_NOTE_CHARS)).filter(Boolean).slice(-MAX_NOTES)
    : [];
  return {
    id,
    title: clean(r.title, MAX_TITLE_CHARS) || 'New chat',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
    messages,
    notes,
    repo: typeof r.repo === 'string' ? clean(r.repo, 120) : undefined,
  };
}

/** Loads one of the caller's sessions. Returns null for an unknown id — which
 *  includes another student's id, since the lookup is namespaced. */
export async function loadSession(
  userId: string | number,
  sessionId: string,
): Promise<AgentSession | null> {
  if (!isValidSessionId(sessionId)) return null;
  try {
    const raw = await kvGet<unknown>(sessionKey(userId, sessionId));
    return raw ? parseSession(raw, sessionId) : null;
  } catch {
    return null;
  }
}

/**
 * Persists a session and refreshes its entry in the student's index.
 *
 * Best-effort: a memory write that fails must not turn a good answer into an
 * error, so this reports success rather than throwing. Callers that care —
 * the route telling the student "I could not save this chat" — check the
 * return value.
 */
export async function saveSession(
  userId: string | number,
  session: AgentSession,
): Promise<boolean> {
  const trimmed: AgentSession = {
    ...session,
    title: clean(session.title, MAX_TITLE_CHARS) || 'New chat',
    messages: session.messages.slice(-MAX_TRANSCRIPT_MESSAGES),
    notes: session.notes.slice(-MAX_NOTES),
    updatedAt: Date.now(),
  };
  try {
    const wrote = await kvSet(sessionKey(userId, session.id), trimmed, SESSION_TTL_SECONDS);
    if (!wrote) return false;
    await touchIndex(userId, { id: trimmed.id, title: trimmed.title, updatedAt: trimmed.updatedAt });
    return true;
  } catch {
    return false;
  }
}

/** Most-recent-first list of the caller's chats, for the sidebar. */
export async function listSessions(userId: string | number): Promise<SessionIndexEntry[]> {
  try {
    const raw = await kvGet<unknown>(indexKey(userId));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => ({
        id: typeof e.id === 'string' ? e.id : '',
        title: clean(e.title, MAX_TITLE_CHARS) || 'New chat',
        updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : 0,
      }))
      .filter((e) => isValidSessionId(e.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SESSIONS_PER_USER);
  } catch {
    return [];
  }
}

async function touchIndex(userId: string | number, entry: SessionIndexEntry): Promise<void> {
  const existing = await listSessions(userId);
  const next = [entry, ...existing.filter((e) => e.id !== entry.id)].slice(0, MAX_SESSIONS_PER_USER);
  // The index outlives any single session so the sidebar does not empty out
  // while a chat is still readable; entries for expired sessions are dropped
  // lazily when the student opens one and gets null back.
  await kvSet(indexKey(userId), next, SESSION_TTL_SECONDS);
}

/** Forgets one chat. The student's own delete button; also used to prune an
 *  index entry whose session has expired. */
export async function deleteSession(userId: string | number, sessionId: string): Promise<boolean> {
  if (!isValidSessionId(sessionId)) return false;
  try {
    await kvDel(sessionKey(userId, sessionId));
    const remaining = (await listSessions(userId)).filter((e) => e.id !== sessionId);
    await kvSet(indexKey(userId), remaining, SESSION_TTL_SECONDS);
    return true;
  } catch {
    return false;
  }
}

/** Starts a chat. Not persisted until the first exchange is appended. */
export function newSession(firstMessage: string): AgentSession {
  const now = Date.now();
  return {
    id: newSessionId(),
    title: titleFrom(firstMessage),
    createdAt: now,
    updatedAt: now,
    messages: [],
    notes: [],
  };
}

/** Records one exchange. Trimming happens here so callers cannot forget. */
export function appendExchange(
  session: AgentSession,
  userText: string,
  assistantText: string,
): AgentSession {
  const now = Date.now();
  const messages = [
    ...session.messages,
    { role: 'user' as const, content: cleanBody(userText, MAX_MESSAGE_CHARS), at: now },
    { role: 'assistant' as const, content: cleanBody(assistantText, MAX_ASSISTANT_MESSAGE_CHARS), at: now },
  ].slice(-MAX_TRANSCRIPT_MESSAGES);
  return { ...session, messages, updatedAt: now };
}

/** Adds a durable note, ignoring duplicates so a repeated observation does
 *  not evict the rest of what the agent remembers. */
export function remember(session: AgentSession, note: string): AgentSession {
  const n = clean(note, MAX_NOTE_CHARS);
  if (!n || session.notes.includes(n)) return session;
  return { ...session, notes: [...session.notes, n].slice(-MAX_NOTES) };
}

/**
 * Renders a session's durable state for the system prompt.
 *
 * Notes are student- and model-authored text that will sit next to
 * instructions, so the caller must wrap this in the untrusted-data envelope
 * (lib/assistant-guardrails.ts wrapRetrievedData) exactly as it does for
 * GitHub profile data. Returns '' when there is nothing worth spending
 * tokens on.
 */
export function describeMemory(session: AgentSession | null): string {
  if (!session) return '';
  const parts: string[] = [];
  if (session.repo) parts.push(`Working on repository: ${session.repo}.`);
  if (session.notes.length) {
    parts.push(`Remembered from earlier in this chat:\n- ${session.notes.join('\n- ')}`);
  }
  return parts.join('\n');
}
