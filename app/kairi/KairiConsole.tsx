'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MarkdownLite } from '@/app/components/MarkdownLite';
import { readAgentEvents, type AgentEvent } from '@/lib/agent-events';
import { firstHeading, parseMarkdown } from '@/lib/markdown-lite';
import {
  KAIRI_CHIPS,
  KAIRI_DOORS,
  KAIRI_LIMITS,
  KAIRI_MODEL_ID,
  KAIRI_NAME,
  KAIRI_TAGLINE,
} from '@/lib/kairi';

/**
 * The Kairi page.
 *
 * Every answer is laid out as a short article rather than a chat bubble: a
 * title, a body in real typography (headings, lists, tables, copyable code),
 * and a footer that says what the agent did, how long it took, and lets the
 * student copy or download the answer as Markdown. While the agent works, the
 * same card shows each tool as it runs and the answer as it is written, so a
 * forty-second run reads as progress instead of a hang.
 *
 * The console keeps a copy of the visible transcript, but it is NOT the source
 * of truth: the server stores each chat under the caller's verified GitHub id
 * (lib/agent-memory.ts) and rebuilds the conversation from there on every
 * turn. So this component sends one message plus a session id, not a replayed
 * history — a client cannot edit what it previously said.
 */

interface Step {
  id: string;
  kind: 'tool' | 'thought';
  label: string;
  done: boolean;
  ok: boolean;
  ms?: number;
}

interface Exchange {
  id: string;
  question: string;
  answer: string;
  /** Still streaming: the card shows activity and a caret. */
  pending: boolean;
  status?: string;
  steps: Step[];
  toolsUsed: string[];
  ms?: number;
  /** Set when the student pressed Stop mid-answer. */
  stopped?: boolean;
  /** Loaded from the saved chat rather than answered just now. */
  restored?: boolean;
}

interface Viewer {
  id: number;
  login: string;
  name: string;
  avatarUrl: string;
}

interface ChatSummary {
  id: string;
  title: string;
  updatedAt: number;
}

function relativeTime(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function seconds(ms: number): string {
  return ms < 1000 ? `${Math.max(1, Math.round(ms / 100)) / 10}s` : `${Math.round(ms / 100) / 10}s`;
}

/** A readable file name for a downloaded answer. */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'answer'
  );
}

function ActivityRail({ steps, status, pending }: { steps: Step[]; status?: string; pending: boolean }) {
  if (steps.length === 0 && !pending) return null;
  return (
    <ol className="mb-4 space-y-1.5 border-l-2 border-line pl-4" aria-label="What the agent did">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2 text-[13px] leading-snug">
          {s.kind === 'thought' ? (
            <span className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-full border border-line-heavy" aria-hidden="true" />
          ) : s.done ? (
            <span
              className={
                'mt-[3px] inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ' +
                (s.ok ? 'bg-success-500 text-white' : 'bg-warning-400 text-white')
              }
              aria-hidden="true"
            >
              {s.ok ? '✓' : '!'}
            </span>
          ) : (
            <span className="kairi-spinner mt-[2px] shrink-0" aria-hidden="true" />
          )}
          <span className={s.kind === 'thought' ? 'italic text-ink-soft' : 'text-ink-mid'}>
            {s.label}
            {s.done && typeof s.ms === 'number' && (
              <span className="ml-1.5 font-mono text-[11px] text-ink-faint">{seconds(s.ms)}</span>
            )}
            {s.done && !s.ok && <span className="ml-1.5 text-[12px] text-warning-600">(no luck)</span>}
          </span>
        </li>
      ))}
      {pending && status && (
        <li className="flex items-center gap-2 text-[13px] text-ink-soft">
          <span className="kairi-spinner shrink-0" aria-hidden="true" />
          <span>{status}…</span>
        </li>
      )}
    </ol>
  );
}

/** Splits off a heading the answer opens with, to use as the article title. */
function splitTitle(answer: string): { title: string | null; body: string } {
  const trimmed = answer.trimStart();
  const m = trimmed.match(/^#{1,4}\s+[^\n]*\n?/);
  if (!m) return { title: null, body: answer };
  const heading = firstHeading(parseMarkdown(m[0]));
  return heading ? { title: heading, body: trimmed.slice(m[0].length) } : { title: null, body: answer };
}

function AnswerCard({ exchange, onAskFollowUp }: { exchange: Exchange; onAskFollowUp: (q: string) => void }) {
  const [copied, setCopied] = useState(false);
  // Only a heading the answer OPENS with becomes the article title. The house
  // style puts the direct answer first and headings after it, so the first
  // heading in the body is usually a section, not a title.
  const { title, body } = splitTitle(exchange.answer);

  const markdown = `# ${title ?? exchange.question}\n\n${body.trim()}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the text is still selectable */
    }
  };

  const download = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairi-${slugify(title ?? exchange.question)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const trail = [...new Set(exchange.toolsUsed)];
  const showBody = exchange.answer.length > 0;

  return (
    <article className="article-enter" aria-busy={exchange.pending}>
      {/* The question, set like a pull quote above the answer. */}
      <p className="mb-3 text-[13px] font-[520] uppercase tracking-wider text-ink-faint">You asked</p>
      <blockquote className="mb-6 border-l-[3px] border-brand-300 pl-4 text-[16px] leading-relaxed text-ink-mid">
        <p className="whitespace-pre-wrap">{exchange.question}</p>
      </blockquote>

      <div className="rounded-2xl border border-line bg-ground p-5 shadow-card sm:p-7">
        <ActivityRail steps={exchange.steps} status={exchange.status} pending={exchange.pending && !showBody} />

        {title && (
          <h1 className="mb-4 text-[24px] font-[640] leading-tight tracking-[-0.015em] text-ink sm:text-[27px]">
            {title}
          </h1>
        )}

        {showBody ? (
          <div className="text-[15.5px] text-ink">
            <MarkdownLite text={body} density="article" />
            {exchange.pending && <span className="kairi-caret" aria-hidden="true" />}
          </div>
        ) : exchange.pending ? (
          <p className="text-[14px] text-ink-soft">
            {exchange.status ? `${exchange.status}…` : 'Starting…'}
          </p>
        ) : null}

        {exchange.stopped && (
          <p className="mt-4 text-[12.5px] italic text-ink-soft">Stopped before the answer was finished.</p>
        )}

        {!exchange.pending && (
          <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-[12.5px] text-ink-soft">
            <span className="min-w-0">
              {exchange.restored
                ? 'From this chat\u2019s history'
                : trail.length > 0
                  ? `${trail.length} ${trail.length === 1 ? 'lookup' : 'lookups'}`
                  : 'Answered from what Kairi already knew'}
              {typeof exchange.ms === 'number' && ` · ${seconds(exchange.ms)}`}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={copy}
                className="rounded-md px-2 py-1 font-[500] text-ink-mid transition-colors hover:bg-panel hover:text-ink"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={download}
                className="rounded-md px-2 py-1 font-[500] text-ink-mid transition-colors hover:bg-panel hover:text-ink"
              >
                Download .md
              </button>
              <button
                type="button"
                onClick={() => onAskFollowUp(`Go deeper on this: ${title ?? exchange.question}`)}
                className="rounded-md px-2 py-1 font-[500] text-brand-600 transition-colors hover:bg-brand-0"
              >
                Go deeper
              </button>
            </span>
          </footer>
        )}
      </div>
    </article>
  );
}

export function KairiConsole({ viewer }: { viewer: Viewer }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [memoryOff, setMemoryOff] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  /** The transcript pane — the only thing on this page that scrolls. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Suppresses re-issuing a glide while one is still animating. */
  const glideUntilRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Scroll follows the answer only while the reader is already near the
  // bottom; a student who scrolled up to re-read is not yanked back down.
  const followRef = useRef(true);

  /**
   * Auto-follow is driven by INTENT, not by position.
   *
   * A position-only rule ("stop following when far from the bottom") turns
   * itself off during its own animation: a smooth scroll toward the bottom
   * spends most of its life far from the bottom. So a gesture — wheel, touch,
   * Page Up — is what disengages following, and arriving at the bottom by any
   * means re-engages it.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceToBottom = () => el.scrollHeight - el.clientHeight - el.scrollTop;
    const onGesture = () => {
      if (distanceToBottom() > 120) followRef.current = false;
    };
    const onScroll = () => {
      if (distanceToBottom() < 80) followRef.current = true;
    };
    el.addEventListener('wheel', onGesture, { passive: true });
    el.addEventListener('touchmove', onGesture, { passive: true });
    el.addEventListener('keydown', onGesture);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onGesture);
      el.removeEventListener('touchmove', onGesture);
      el.removeEventListener('keydown', onGesture);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !followRef.current) return;
    const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (distance <= 1) return;
    // A large gap means a new question was just added: glide to it once.
    // The few pixels a streaming answer adds per token are pinned instantly,
    // because re-issuing a smooth scroll on every token restarts the
    // animation before it can finish — which is what made following feel
    // like it was fighting the reader instead of following them.
    if (distance > 360) {
      if (Date.now() > glideUntilRef.current) {
        glideUntilRef.current = Date.now() + 700;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [exchanges]);

  // Abort any in-flight request if the student navigates away mid-answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  const refreshChats = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/sessions');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.sessions)) setChats(data.sessions);
    } catch {
      // A missing chat list is cosmetic; never surface it as an error.
    }
  }, []);

  // Load the chat list once on mount. Written as a subscription to an
  // external system (fetch -> callback) rather than an awaited call, so the
  // state update happens in the response handler and not in the effect body.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/agent/sessions')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.sessions)) setChats(data.sessions);
      })
      .catch(() => {
        // A missing chat list is cosmetic; never surface it as an error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openChat(id: string) {
    if (busy) return;
    setError(null);
    setSidebarOpen(false);
    try {
      const res = await fetch(`/api/agent/sessions?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        // Expired or already deleted — drop it from the list rather than
        // leaving a row that does nothing when clicked.
        setChats((prev) => prev.filter((c) => c.id !== id));
        setError('That chat has expired. Chats are kept for a week.');
        return;
      }
      const data = await res.json();
      const msgs: Array<{ role: string; content: string }> = Array.isArray(data?.messages) ? data.messages : [];
      const restored: Exchange[] = [];
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].role !== 'user') continue;
        const next = msgs[i + 1];
        restored.push({
          id: `${id}-${i}`,
          question: msgs[i].content,
          answer: next && next.role === 'assistant' ? next.content : '',
          pending: false,
          steps: [],
          toolsUsed: [],
          restored: true,
        });
      }
      setExchanges(restored);
      setSessionId(data?.id ?? id);
      followRef.current = true;
      // Land on the most recent turn. Gliding there would animate past the
      // whole conversation, which reads as the page running away from you.
      glideUntilRef.current = Date.now() + 700;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch {
      setError('Could not open that chat. Try again in a moment.');
    }
  }

  async function deleteChat(id: string) {
    try {
      await fetch(`/api/agent/sessions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      /* the refresh below reflects reality either way */
    }
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (sessionId === id) newChat();
  }

  function newChat() {
    abortRef.current?.abort();
    setExchanges([]);
    setSessionId(null);
    setError(null);
    setSidebarOpen(false);
    followRef.current = true;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    inputRef.current?.focus();
  }

  /** Applies one stream event to the pending exchange. */
  function applyEvent(exchangeId: string, event: AgentEvent) {
    setExchanges((prev) =>
      prev.map((x) => {
        if (x.id !== exchangeId) return x;
        switch (event.type) {
          case 'status':
            return { ...x, status: event.text };
          case 'tool_start': {
            // Text written before a tool call is the agent thinking aloud
            // ("Let me check the repo first"), not the answer. Keep it in the
            // rail, where it reads as a step, and start the answer afresh.
            const steps = [...x.steps];
            const preface = x.answer.trim();
            if (preface) {
              steps.push({ id: `t-${steps.length}`, kind: 'thought', label: preface.slice(0, 160), done: true, ok: true });
            }
            steps.push({ id: event.id, kind: 'tool', label: event.label, done: false, ok: true });
            return { ...x, answer: '', steps, status: undefined };
          }
          case 'tool_end':
            return {
              ...x,
              steps: x.steps.map((s) => (s.id === event.id ? { ...s, done: true, ok: event.ok, ms: event.ms } : s)),
            };
          case 'delta':
            return { ...x, answer: x.answer + event.text, status: undefined };
          case 'done':
            return {
              ...x,
              answer: event.reply,
              pending: false,
              status: undefined,
              toolsUsed: event.toolsUsed,
              ms: event.ms,
              steps: x.steps.map((s) => ({ ...s, done: true })),
            };
          case 'error':
            return { ...x, pending: false, status: undefined };
        }
      }),
    );
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    setError(null);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setExchanges((prev) => [
      ...prev,
      { id, question, answer: '', pending: true, status: 'Starting', steps: [], toolsUsed: [] },
    ]);
    setInput('');
    setBusy(true);
    followRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let finished = false;

    const drop = () => setExchanges((prev) => prev.filter((x) => x.id !== id));

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        // One message, not a replayed transcript: the server holds the thread.
        body: JSON.stringify({ messages: [{ role: 'user', content: question }], sessionId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { code?: string; error?: string; retryAfter?: number } | null;
        const code = data?.code;
        if (code === 'auth_required' || code === 'auth_expired') {
          setError('Your sign-in has expired. Reload the page and sign in again — your question is still in the box.');
        } else if (code === 'auth_unavailable') {
          setError('We couldn’t reach GitHub to check your sign-in. Try again in a moment.');
        } else if (res.status === 429) {
          setError(data?.error ?? 'That’s a lot of questions in a short time. Give it a minute and try again.');
        } else {
          setError(data?.error ?? 'Something went wrong. Please try again.');
        }
        setInput(question);
        drop();
        return;
      }

      if (!res.body || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
        // A JSON answer (an older server, or a proxy that buffered the
        // stream) still renders: it has the same fields as `done`.
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const reply = typeof data?.reply === 'string' ? data.reply : '';
        applyEvent(id, {
          type: 'done',
          reply: reply || 'I couldn’t come up with an answer for that. Try rephrasing it?',
          toolsUsed: Array.isArray(data?.toolsUsed) ? (data.toolsUsed as string[]) : [],
          iterations: 0,
          sessionId: typeof data?.sessionId === 'string' ? data.sessionId : '',
          sessionTitle: '',
          remembered: data?.remembered !== false,
          engine: 'ts',
          ms: typeof data?.ms === 'number' ? data.ms : 0,
        });
        if (typeof data?.sessionId === 'string') setSessionId(data.sessionId);
        setMemoryOff(data?.remembered === false);
        finished = true;
        void refreshChats();
        return;
      }

      let streamed = '';
      await readAgentEvents(res.body, (event) => {
        if (event.type === 'done') {
          finished = true;
          setSessionId(event.sessionId);
          // The server reports whether the turn was actually persisted. When
          // the store is down, say so instead of implying a memory that is not there.
          setMemoryOff(!event.remembered);
          applyEvent(id, {
            ...event,
            reply: event.reply || 'I couldn’t come up with an answer for that. Try rephrasing it?',
          });
        } else if (event.type === 'error') {
          finished = true;
          setError(event.error);
          setInput(question);
          drop();
        } else {
          if (event.type === 'delta') streamed += event.text;
          if (event.type === 'tool_start') streamed = '';
          applyEvent(id, event);
        }
      });

      if (!finished) {
        // The stream ended without a terminal event — the connection was cut
        // by a proxy. Keep whatever was written; the server still saves the
        // full answer to the chat, so reopening it shows the rest.
        if (streamed.trim()) {
          setExchanges((prev) => prev.map((x) => (x.id === id ? { ...x, pending: false, stopped: true, status: undefined } : x)));
        } else {
          drop();
          setError('The connection dropped before the answer arrived. Reopen this chat in a moment — the answer may still have been saved.');
        }
      }
      void refreshChats();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setExchanges((prev) =>
          prev
            .map((x) => (x.id === id ? { ...x, pending: false, stopped: true, status: undefined } : x))
            .filter((x) => x.id !== id || x.answer.length > 0),
        );
        void refreshChats();
      } else {
        setError('The connection dropped. Please try again.');
        setInput(question);
        drop();
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const empty = exchanges.length === 0;

  const sidebar = (
    <nav className="flex h-full min-h-0 w-64 shrink-0 flex-col border-r border-line bg-panel" aria-label="Your chats">
      <div className="p-3">
        <button
          type="button"
          onClick={newChat}
          className="w-full rounded-xl border border-line bg-ground px-3 py-2 text-left text-[13.5px] font-[520] text-ink transition-colors hover:border-brand-300 hover:text-brand-600"
        >
          + New chat
        </button>
      </div>
      <div className="scroll-rail min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" data-lenis-prevent>
        {chats.length === 0 ? (
          <p className="px-2 py-3 text-[12.5px] leading-relaxed text-ink-soft">
            Your chats show up here. Each one keeps its own memory for a week.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {chats.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  type="button"
                  onClick={() => openChat(c.id)}
                  className={
                    'w-full rounded-lg px-2.5 py-2 pr-8 text-left transition-colors hover:bg-ground ' +
                    (c.id === sessionId ? 'bg-ground' : '')
                  }
                >
                  <span className="block truncate text-[13px] leading-snug text-ink">{c.title}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-soft">{relativeTime(c.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteChat(c.id)}
                  aria-label={`Delete chat: ${c.title}`}
                  className="absolute right-1.5 top-2 rounded-md px-1.5 py-1 text-[11px] text-ink-soft opacity-0 transition-opacity hover:text-ink focus:opacity-100 group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );

  return (
    // 61px = the nav's fixed 60px height plus its 1px bottom border. The
    // page itself never scrolls: the transcript pane does, and the composer
    // sits below it, permanently on screen at every window size.
    <div className="flex h-[calc(100dvh-61px)] w-full overflow-hidden">
      <div className="hidden h-full md:block">{sidebar}</div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="h-full bg-ground shadow-xl">{sidebar}</div>
          <button type="button" aria-label="Close chat list" className="flex-1 bg-black/30" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          tabIndex={-1}
          className="scroll-page min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-lenis-prevent
        >
          <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 sm:px-6 sm:pt-7">
        <header className="mb-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-line px-2 py-1 text-[12px] text-ink-soft md:hidden"
            >
              Chats
            </button>
            <h1 className="text-2xl font-[600] tracking-tight text-ink">{KAIRI_NAME}</h1>
            <span className="rounded-full border border-line bg-panel px-2 py-0.5 font-mono text-[11px] text-ink-soft">
              {KAIRI_MODEL_ID}
            </span>
          </div>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-soft">
            {KAIRI_TAGLINE} Signed in as @{viewer.login}.
          </p>
        </header>

        {empty && (
          <section>
            <div className="grid gap-3 sm:grid-cols-3">
              {KAIRI_DOORS.map((door) => (
                <button
                  key={door.title}
                  type="button"
                  onClick={() => ask(door.message)}
                  className="group rounded-xl border border-line bg-ground p-4 text-left transition-colors hover:border-brand-300 hover:bg-panel"
                >
                  <span className="block text-[14px] font-[520] leading-snug text-ink group-hover:text-brand-600">
                    {door.title}
                  </span>
                  <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-soft">{door.blurb}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {KAIRI_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => ask(chip)}
                  className="rounded-full border border-line bg-ground px-3 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-brand-300 hover:text-ink"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-line bg-panel p-4">
              <p className="text-[12.5px] font-[520] text-ink">Before you start</p>
              <ul className="mt-1.5 space-y-1">
                {KAIRI_LIMITS.map((line) => (
                  <li key={line} className="text-[12.5px] leading-relaxed text-ink-soft">
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
                Useful pages:{' '}
                <Link href="/get-started" className="text-brand-600 underline underline-offset-2">
                  Get Started
                </Link>
                {' · '}
                <Link href="/issues" className="text-brand-600 underline underline-offset-2">
                  Common Issues
                </Link>
                {' · '}
                <Link href="/join" className="text-brand-600 underline underline-offset-2">
                  Join the tracker
                </Link>
              </p>
            </div>
          </section>
        )}

        {!empty && (
          <section className="space-y-10" aria-live="polite">
            {exchanges.map((x) => (
              <AnswerCard key={x.id} exchange={x} onAskFollowUp={(q) => ask(q)} />
            ))}
            <div ref={endRef} />
          </section>
        )}

          </div>
        </div>

        {/* The composer. Outside the scroll pane on purpose: it cannot be
            pushed below the fold and never floats over the article. */}
        <div className="border-t border-line bg-ground">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
        {memoryOff && (
          <p className="mb-2 rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px] text-ink-soft">
            Heads up: this chat isn’t being saved right now, so it won’t be here when you come back.
          </p>
        )}

        {error && (
          <p role="alert" className="mb-2 rounded-lg border border-warning-200 bg-warning-0 px-3 py-2 text-[13px] text-ink">
            {error}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-ground p-2 shadow-pop">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={busy ? 'Kairi is working — you can stop it any time' : 'Paste a repo link, or ask anything — even if it feels like a silly question'}
              disabled={busy}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-soft/70 disabled:opacity-70"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="shrink-0 rounded-xl border border-line px-4 py-2 text-[14px] font-[500] text-ink transition-colors hover:bg-panel"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="shrink-0 rounded-xl bg-brand-solid px-4 py-2 text-[14px] font-[500] text-white transition-colors hover:bg-brand-solid-hover disabled:opacity-40"
              >
                Ask
              </button>
            )}
          </div>
          <p className="mt-2 hidden px-1 text-[11.5px] text-ink-soft sm:block">
            {KAIRI_NAME} can be wrong · public data only · read-only, it can’t change anything · Shift+Enter for a new line
          </p>
        </form>
          </div>
        </div>
      </main>
    </div>
  );
}
