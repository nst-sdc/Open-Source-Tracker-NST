/**
 * lib/sse.ts
 *
 * Minimal parser for OpenAI-style `text/event-stream` chat responses.
 *
 * Lifted out of AssistantWidget.tsx, where it was welded to `fetch` inside a
 * component and could not be unit-tested — so the awkward cases (a UTF-8
 * character split across two network chunks, keep-alive frames, a `[DONE]`
 * arriving mid-buffer) were never covered by anything.
 */

export interface SseChunkResult {
  tokens: string[];
  /** True once `data: [DONE]` has been seen. Ignore anything after it. */
  done: boolean;
}

export interface SseParser {
  push(chunk: string): SseChunkResult;
}

/**
 * Stateful line-buffering parser. Feed it decoded string chunks in order;
 * it holds any partial trailing line until the rest arrives.
 */
export function createSseParser(): SseParser {
  let buffer = '';
  let finished = false;

  return {
    push(chunk: string): SseChunkResult {
      if (finished) return { tokens: [], done: true };
      buffer += chunk;

      const lines = buffer.split('\n');
      // The last element is either '' (chunk ended on a newline) or a
      // partial line; either way it is not ready to parse yet.
      buffer = lines.pop() ?? '';

      const tokens: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue; // comments, keep-alives, blanks
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          finished = true;
          return { tokens, done: true };
        }
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) tokens.push(delta);
        } catch {
          // Partial or non-JSON frame — skip it rather than killing the stream.
        }
      }
      return { tokens, done: false };
    },
  };
}

/**
 * Drains a response body through the parser. `stream: true` on the decoder
 * is what keeps a multi-byte character that straddles two chunks intact.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onToken: (token: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const result = parser.push(decoder.decode(value, { stream: true }));
    for (const token of result.tokens) onToken(token);
    if (result.done) return;
  }
}
