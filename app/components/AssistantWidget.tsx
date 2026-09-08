'use client';

import { useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const PANEL_CLASSES =
  'fixed bottom-20 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] h-[28rem] max-h-[70vh] flex flex-col bg-white border border-line rounded-2xl shadow-card overflow-hidden';

/** Minimal SSE parser for OpenAI-style chat streams. */
async function streamReply(
  messages: Message[],
  onToken: (token: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming is not supported in this browser.');
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) onToken(delta);
      } catch {
        // Ignore keep-alives and partial frames.
      }
    }
  }
}

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

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
        controller.signal
      );
      if (!acc) throw new Error('The assistant returned an empty response.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      if ((err as Error)?.name === 'AbortError') return;
      setMessages((prev) => prev.slice(0, -1));
      setError(message);
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
        className="fixed bottom-4 right-4 z-50 h-13 w-13 p-3.5 rounded-full bg-brand-500 hover:bg-brand-600 text-white shadow-brand-btn cursor-pointer flex items-center justify-center"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {open && (
        <div className={PANEL_CLASSES} role="dialog" aria-label="Open-source assistant">
          <div className="px-4 py-3 border-b border-line bg-brand-0">
            <div className="text-sm font-[650] text-ink">OSS Assistant</div>
            <div className="text-[11px] text-ink-soft">Read-only help for open-source + this site</div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-[12.5px] text-ink-soft leading-relaxed">
                Ask about contributing, good first issues, or how the leaderboard works.
                Sign in with GitHub for answers about your own standing.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === 'user'
                    ? 'ml-8 rounded-xl bg-brand-500 text-white px-3 py-2 text-[12.5px] whitespace-pre-wrap break-words'
                    : 'mr-8 rounded-xl bg-panel border border-line px-3 py-2 text-[12.5px] text-ink whitespace-pre-wrap break-words'
                }
              >
                {m.content || (busy && i === messages.length - 1 ? '…' : '')}
              </div>
            ))}
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
                className="flex-1 h-10 rounded-[10px] border border-line bg-white px-3 text-[13px] text-ink outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !input.trim()}
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
