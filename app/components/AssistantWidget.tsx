'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MarkdownLite } from './MarkdownLite';
import { readSseStream } from '@/lib/sse';
import { KAIRI_NAME, KAIRI_PATH } from '@/lib/kairi';

/**
 * The floating chat assistant. Deliberately plain: it answers questions and
 * nothing else. Anything that needs tools, multi-step work or room to think
 * lives on the Kairi page, which this widget links to instead of duplicating.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const PANEL_CLASSES =
  'panel-enter fixed bottom-20 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] h-[28rem] max-h-[70vh] flex flex-col bg-ground border border-line rounded-2xl shadow-card overflow-hidden';

/** Three staggered bouncing dots shown while a reply is pending. */
function TypingIndicator() {
  return (
    <span className="flex items-center gap-1 py-1.5" aria-label="Assistant is thinking">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-soft"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

async function streamReply(
  messages: Message[],
  onToken: (token: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
    err.name = (data as { code?: string }).code ?? err.name;
    throw err;
  }
  if (!res.body) throw new Error('Streaming is not supported in this browser.');
  await readSseStream(res.body, onToken);
}

export default function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** Whether the reader is parked at the bottom, so streaming may follow. */
  const nearBottomRef = useRef(true);

  // Follow the reply as it streams, but only while the reader is already at
  // the bottom — scrolling up to re-read an earlier answer should not be
  // undone by the next token.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // A gesture away from the bottom stops the follow; returning resumes it.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceToBottom = () => el.scrollHeight - el.clientHeight - el.scrollTop;
    const onGesture = () => {
      if (distanceToBottom() > 90) nearBottomRef.current = false;
    };
    const onScroll = () => {
      if (distanceToBottom() < 60) nearBottomRef.current = true;
    };
    el.addEventListener('wheel', onGesture, { passive: true });
    el.addEventListener('touchmove', onGesture, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onGesture);
      el.removeEventListener('touchmove', onGesture);
      el.removeEventListener('scroll', onScroll);
    };
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Checked when the panel is first opened, not on mount: this component is
  // in the root layout, so a fetch on mount would fire on every page load
  // site-wide. The authoritative gate is the route's own 401 — this is only
  // so a signed-out student sees an invitation instead of an error.
  useEffect(() => {
    if (!open || signedIn !== null) return;
    let cancelled = false;
    fetch('/api/auth/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        // `unknown: true` means we could not check; assume signed in and let
        // the route decide, rather than showing a wrong sign-in prompt.
        if (data.unknown) setSignedIn(true);
        else setSignedIn(Boolean(data.authenticated));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, signedIn]);

  // The widget is mounted in the root layout and is fixed to the bottom-right,
  // where it would sit on top of Kairi's own composer.
  if (pathname === KAIRI_PATH || pathname.startsWith(`${KAIRI_PATH}/`)) return null;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    const next: Message[] = [...messages, { role: 'user' as const, content: text }].slice(-10);
    setMessages(next);
    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    try {
      await streamReply(
        next,
        (token) => {
          acc += token;
          const snapshot = acc;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: snapshot };
            return copy;
          });
        },
        controller.signal,
      );
      if (!acc) throw new Error('The assistant returned an empty response.');
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      const name = (err as Error)?.name;
      if (name === 'auth_required' || name === 'auth_expired') {
        setSignedIn(false);
      }
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages((prev) => prev.slice(0, -1));
      setError(message);
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle open-source assistant"
        className="fixed bottom-4 right-4 z-50 h-13 w-13 p-3.5 rounded-full bg-brand-500 hover:bg-brand-600 text-white shadow-brand-btn cursor-pointer flex items-center justify-center transition duration-150 motion-safe:hover:scale-105 motion-safe:active:scale-95"
      >
        <span className="relative block h-6 w-6" aria-hidden="true">
          <svg
            className={
              'absolute inset-0 h-6 w-6 transition duration-200 motion-reduce:transition-none ' +
              (open ? 'opacity-0 motion-safe:-rotate-90 motion-safe:scale-75' : 'opacity-100 rotate-0 scale-100')
            }
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <svg
            className={
              'absolute inset-0 h-6 w-6 transition duration-200 motion-reduce:transition-none ' +
              (open ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 motion-safe:rotate-90 motion-safe:scale-75')
            }
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </span>
      </button>

      {open && (
        <div className={PANEL_CLASSES} role="dialog" aria-label="Open-source assistant">
          <div className="px-4 py-3 border-b border-line bg-brand-0">
            <div className="text-sm font-[650] text-ink">OSS Assistant</div>
            <div className="text-[11px] text-ink-soft">Read-only help for open-source + this site</div>
          </div>

          <div
            ref={listRef}
            className="scroll-rail min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
            data-lenis-prevent
          >
            {signedIn === false ? (
              <div className="space-y-2">
                <p className="text-[12.5px] text-ink leading-relaxed">
                  Sign in with GitHub to chat. It keeps answers specific to you, and keeps the shared
                  AI budget from being spent anonymously.
                </p>
                <a
                  href={`/api/auth/github?next=${encodeURIComponent(pathname || '/')}`}
                  className="inline-block rounded-[10px] bg-brand-500 px-3 py-1.5 text-[12.5px] font-[550] text-white hover:bg-brand-600"
                >
                  Sign in with GitHub
                </a>
              </div>
            ) : (
              messages.length === 0 && (
                <p className="text-[12.5px] text-ink-soft leading-relaxed">
                  Ask about contributing, good first issues, or how the leaderboard works. For
                  step-by-step help and things it can look up for you, open{' '}
                  <Link
                    href={KAIRI_PATH}
                    className="text-brand-600 underline underline-offset-2"
                    onClick={() => setOpen(false)}
                  >
                    {KAIRI_NAME}
                  </Link>
                  .
                </p>
              )
            )}

            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div
                  key={i}
                  className="bubble-enter ml-8 rounded-xl bg-brand-500 text-white px-3 py-2 text-[12.5px] whitespace-pre-wrap break-words"
                >
                  {m.content}
                </div>
              ) : (
                <div
                  key={i}
                  className="bubble-enter mr-8 rounded-xl bg-panel border border-line px-3 py-2 text-[12.5px] text-ink break-words"
                >
                  {m.content ? (
                    <MarkdownLite text={m.content} />
                  ) : busy && i === messages.length - 1 ? (
                    <TypingIndicator />
                  ) : null}
                </div>
              ),
            )}
            {error && <p className="text-[12px] text-red-600">{error}</p>}
          </div>

          <div className="px-3 py-2.5 border-t border-line">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                maxLength={2000}
                placeholder="Ask anything about open source…"
                aria-label="Message the assistant"
                disabled={signedIn === false}
                className="flex-1 h-10 rounded-[10px] border border-line bg-ground px-3 text-[13px] text-ink outline-none focus:border-brand-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !input.trim() || signedIn === false}
                className="h-10 px-3.5 rounded-[10px] bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-[13px] font-[550] cursor-pointer"
              >
                {busy ? '…' : 'Send'}
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-ink-soft">Bot can be wrong · public data only</p>
          </div>
        </div>
      )}
    </>
  );
}
