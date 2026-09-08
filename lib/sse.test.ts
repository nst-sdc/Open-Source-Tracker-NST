/**
 * SSE parser tests. These cases were unreachable while the parser lived
 * inside AssistantWidget.tsx welded to fetch().
 */
import { describe, it, expect } from 'vitest';
import { createSseParser, readSseStream } from './sse';

const frame = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

describe('createSseParser', () => {
  it('extracts content deltas in order', () => {
    const p = createSseParser();
    expect(p.push(frame('Hello') + frame(' world')).tokens).toEqual(['Hello', ' world']);
  });

  it('holds a partial line until the rest arrives', () => {
    const p = createSseParser();
    const full = frame('split');
    const cut = Math.floor(full.length / 2);
    expect(p.push(full.slice(0, cut)).tokens).toEqual([]);
    expect(p.push(full.slice(cut)).tokens).toEqual(['split']);
  });

  it('stops at [DONE] and ignores everything after it', () => {
    const p = createSseParser();
    const first = p.push(frame('a') + 'data: [DONE]\n\n' + frame('b'));
    expect(first.tokens).toEqual(['a']);
    expect(first.done).toBe(true);
    expect(p.push(frame('c'))).toEqual({ tokens: [], done: true });
  });

  it('ignores keep-alives, comments and blank lines', () => {
    const p = createSseParser();
    const result = p.push(': keep-alive\n\n\n' + frame('x') + ': ping\n\n');
    expect(result.tokens).toEqual(['x']);
    expect(result.done).toBe(false);
  });

  it('skips malformed JSON without killing the stream', () => {
    const p = createSseParser();
    expect(p.push('data: {not json\n\n' + frame('ok')).tokens).toEqual(['ok']);
  });

  it('ignores frames with no content delta', () => {
    const p = createSseParser();
    const roleOnly = `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`;
    expect(p.push(roleOnly + frame('hi')).tokens).toEqual(['hi']);
  });
});

describe('readSseStream', () => {
  function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    });
  }

  it('reassembles a multi-byte character split across two chunks', async () => {
    // “—” is three UTF-8 bytes; cut the payload between them.
    const bytes = new TextEncoder().encode(frame('a—b') + 'data: [DONE]\n\n');
    const cut = 30;
    const tokens: string[] = [];
    await readSseStream(streamOf([bytes.slice(0, cut), bytes.slice(cut)]), (t) => tokens.push(t));
    expect(tokens.join('')).toBe('a—b');
  });

  it('returns as soon as [DONE] arrives', async () => {
    const enc = new TextEncoder();
    const tokens: string[] = [];
    await readSseStream(
      streamOf([enc.encode(frame('one')), enc.encode('data: [DONE]\n\n'), enc.encode(frame('never'))]),
      (t) => tokens.push(t),
    );
    expect(tokens).toEqual(['one']);
  });

  it('ends cleanly when the stream closes without [DONE]', async () => {
    const tokens: string[] = [];
    await readSseStream(streamOf([new TextEncoder().encode(frame('truncated'))]), (t) => tokens.push(t));
    expect(tokens).toEqual(['truncated']);
  });
});
