/**
 * Streaming-path tests for the agent loop: SSE reassembly of tool-call
 * deltas, live text deltas through the hold-back guardrail, usage
 * accounting, and the one-shot retry on a transient provider failure.
 * The JSON-path invariants live in agent-loop.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BLOCKED_REPLY, runAgent } from './agent-loop';
import type { AgentEvent } from './agent-events';
import type { ToolDef } from './agent-tools';

const CONTEXT = '<retrieved_data>test context</retrieved_data>';

/** One provider response, expressed as the chunk deltas it should stream. */
type Chunk =
  | { content: string }
  | { tool: { index: number; id?: string; name?: string; args?: string } }
  | { usage: { prompt_tokens: number; completion_tokens: number } };

function sse(chunks: Chunk[]): string {
  const frames = chunks.map((c) => {
    if ('usage' in c) return JSON.stringify({ choices: [], usage: c.usage });
    if ('content' in c) return JSON.stringify({ choices: [{ delta: { content: c.content } }] });
    const { index, id, name, args } = c.tool;
    return JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index,
                ...(id ? { id } : {}),
                type: 'function',
                function: { ...(name ? { name } : {}), ...(args !== undefined ? { arguments: args } : {}) },
              },
            ],
          },
        },
      ],
    });
  });
  return frames.map((f) => `data: ${f}\n\n`).join('') + 'data: [DONE]\n\n';
}

/** Streams a body in awkward byte splits so partial frames are exercised. */
function streamed(text: string, splitEvery = 7): Response {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += splitEvery) controller.enqueue(bytes.slice(i, i + splitEvery));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function makeProvider(responses: Array<() => Response>) {
  const bodies: Array<Record<string, unknown>> = [];
  let index = 0;
  const fetchImpl = (async (_input: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? '{}')));
    const next = responses[Math.min(index, responses.length - 1)];
    index++;
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, bodies, calls: () => index };
}

function makeTools() {
  const ran: Array<{ name: string; args: Record<string, unknown> }> = [];
  const tool = (name: string, summary: string): ToolDef => ({
    name,
    description: `stub ${name}`,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    needsLogin: false,
    costsSearch: false,
    run: async (args) => {
      ran.push({ name, args });
      return { ok: true, summary };
    },
  });
  return { tools: [tool('echo', 'echo-result'), tool('other', 'other-result')], ran };
}

let originalKey: string | undefined;
beforeEach(() => {
  originalKey = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = 'test-key-not-real';
});
afterEach(() => {
  if (originalKey === undefined) delete process.env.LLM_API_KEY;
  else process.env.LLM_API_KEY = originalKey;
});

const base = { username: 'octocat', requestId: 'r1' };

describe('runAgent — streamed provider responses', () => {
  it('asks for a stream and reassembles a tool call split across many deltas', async () => {
    const { tools, ran } = makeTools();
    const { fetchImpl, bodies } = makeProvider([
      () =>
        streamed(
          sse([
            { content: 'Let me check.' },
            { tool: { index: 0, id: 'call_a', name: 'echo', args: '' } },
            { tool: { index: 0, args: '{"re' } },
            { tool: { index: 0, args: 'po":"x/y"' } },
            { tool: { index: 0, args: '}' } },
          ]),
        ),
      () => streamed(sse([{ content: 'Final ' }, { content: 'answer.' }])),
    ]);
    const events: AgentEvent[] = [];
    const result = await runAgent(
      { ...base, messages: [{ role: 'user', content: 'go' }], onEvent: (e) => events.push(e) },
      { tools, fetchImpl, contextBlock: CONTEXT },
    );
    expect(bodies[0].stream).toBe(true);
    expect(ran).toEqual([{ name: 'echo', args: { repo: 'x/y' } }]);
    expect(result.reply).toBe('Final answer.');
    expect(result.toolsUsed).toEqual(['echo']);
    // The tool message carries the provider's own call id.
    const toolMsg = (bodies[1].messages as Array<Record<string, unknown>>).find((m) => m.role === 'tool');
    expect(toolMsg?.tool_call_id).toBe('call_a');
    // Activity was reported around the tool run, then the answer streamed.
    const kinds = events.map((e) => e.type);
    expect(kinds.indexOf('tool_start')).toBeLessThan(kinds.indexOf('tool_end'));
    expect(events.find((e) => e.type === 'tool_start')).toMatchObject({ id: 'call_a', name: 'echo' });
    const streamedText = events.filter((e): e is Extract<AgentEvent, { type: 'delta' }> => e.type === 'delta');
    expect(streamedText.map((e) => e.text).join('')).toContain('Final answer.');
  });

  it('keeps two parallel tool calls apart by index', async () => {
    const { tools, ran } = makeTools();
    const { fetchImpl } = makeProvider([
      () =>
        streamed(
          sse([
            { tool: { index: 0, id: 'c0', name: 'echo', args: '{"a":' } },
            { tool: { index: 1, id: 'c1', name: 'other', args: '{"b":' } },
            { tool: { index: 0, args: '1}' } },
            { tool: { index: 1, args: '2}' } },
          ]),
        ),
      () => streamed(sse([{ content: 'done' }])),
    ]);
    await runAgent({ ...base, messages: [{ role: 'user', content: 'go' }] }, { tools, fetchImpl, contextBlock: CONTEXT });
    expect(ran).toEqual([
      { name: 'echo', args: { a: 1 } },
      { name: 'other', args: { b: 2 } },
    ]);
  });

  it('delivers the whole answer as deltas, including the held-back tail', async () => {
    const { tools } = makeTools();
    const long = 'word '.repeat(40).trim(); // well past the 64-char hold
    const { fetchImpl } = makeProvider([() => streamed(sse(long.split(' ').map((w) => ({ content: `${w} ` }))))]);
    const events: AgentEvent[] = [];
    const result = await runAgent(
      { ...base, messages: [{ role: 'user', content: 'go' }], onEvent: (e) => events.push(e) },
      { tools, fetchImpl, contextBlock: CONTEXT },
    );
    const text = events
      .filter((e): e is Extract<AgentEvent, { type: 'delta' }> => e.type === 'delta')
      .map((e) => e.text)
      .join('');
    expect(text.trim()).toBe(result.reply);
  });

  it('never streams a secret that arrives split across chunks', async () => {
    const { tools } = makeTools();
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const { fetchImpl } = makeProvider([
      () =>
        streamed(
          sse([
            { content: 'Sure, the token is ' },
            { content: secret.slice(0, 6) },
            { content: secret.slice(6, 20) },
            { content: secret.slice(20) },
            { content: ' — enjoy.' },
          ]),
          3,
        ),
    ]);
    const events: AgentEvent[] = [];
    const result = await runAgent(
      { ...base, messages: [{ role: 'user', content: 'token?' }], onEvent: (e) => events.push(e) },
      { tools, fetchImpl, contextBlock: CONTEXT },
    );
    const streamedText = events
      .filter((e): e is Extract<AgentEvent, { type: 'delta' }> => e.type === 'delta')
      .map((e) => e.text)
      .join('');
    expect(streamedText).not.toContain('ghp_');
    expect(result.reply).toBe(BLOCKED_REPLY);
  });

  it('sums token usage across every provider call', async () => {
    const { tools } = makeTools();
    const { fetchImpl } = makeProvider([
      () =>
        streamed(
          sse([
            { tool: { index: 0, id: 'c', name: 'echo', args: '{}' } },
            { usage: { prompt_tokens: 100, completion_tokens: 10 } },
          ]),
        ),
      () => streamed(sse([{ content: 'ok' }, { usage: { prompt_tokens: 150, completion_tokens: 20 } }])),
    ]);
    const result = await runAgent({ ...base, messages: [{ role: 'user', content: 'go' }] }, { tools, fetchImpl, contextBlock: CONTEXT });
    expect(result.usage).toEqual({ promptTokens: 250, completionTokens: 30 });
  });

  it('treats an empty stream as no answer', async () => {
    const { tools } = makeTools();
    const { fetchImpl } = makeProvider([() => streamed('data: [DONE]\n\n')]);
    const result = await runAgent({ ...base, messages: [{ role: 'user', content: 'go' }] }, { tools, fetchImpl, contextBlock: CONTEXT });
    expect(result.reply).toBe('I could not produce an answer.');
  });
});

describe('runAgent — transient failures', () => {
  it('retries once after a 429 and reports the retry as status', async () => {
    const { tools } = makeTools();
    const { fetchImpl, calls } = makeProvider([
      () => new Response('slow down', { status: 429 }),
      () => streamed(sse([{ content: 'second time lucky' }])),
    ]);
    const events: AgentEvent[] = [];
    const slept: number[] = [];
    const result = await runAgent(
      { ...base, messages: [{ role: 'user', content: 'go' }], onEvent: (e) => events.push(e) },
      { tools, fetchImpl, contextBlock: CONTEXT, sleep: async (ms) => void slept.push(ms) },
    );
    expect(calls()).toBe(2);
    expect(slept).toEqual([1500]);
    expect(result.reply).toBe('second time lucky');
    expect(result.iterations).toBe(1);
    expect(events.some((e) => e.type === 'status' && /retrying/.test(e.text))).toBe(true);
  });

  it('gives up after the second failure with a status-only error', async () => {
    const { tools } = makeTools();
    const { fetchImpl, calls } = makeProvider([() => new Response('nope', { status: 503 })]);
    await expect(
      runAgent({ ...base, messages: [{ role: 'user', content: 'go' }] }, { tools, fetchImpl, contextBlock: CONTEXT, sleep: async () => {} }),
    ).rejects.toThrow('Provider error 503');
    expect(calls()).toBe(2);
  });

  it('does not retry a 4xx that a second attempt cannot fix', async () => {
    const { tools } = makeTools();
    const { fetchImpl, calls } = makeProvider([() => new Response('bad', { status: 400 })]);
    await expect(
      runAgent({ ...base, messages: [{ role: 'user', content: 'go' }] }, { tools, fetchImpl, contextBlock: CONTEXT, sleep: async () => {} }),
    ).rejects.toThrow('Provider error 400');
    expect(calls()).toBe(1);
  });

  it('skips the retry when the deadline leaves no room for it', async () => {
    const { tools } = makeTools();
    const { fetchImpl, calls } = makeProvider([() => new Response('slow', { status: 429 })]);
    let t = 0;
    // The first call "takes" 65s, leaving less than the retry needs.
    const wrapped = (async (input: unknown, init?: RequestInit) => {
      t += 65_000;
      return fetchImpl(input as string, init);
    }) as unknown as typeof fetch;
    await expect(
      runAgent(
        { ...base, messages: [{ role: 'user', content: 'go' }] },
        { tools, fetchImpl: wrapped, contextBlock: CONTEXT, now: () => t, sleep: async () => {} },
      ),
    ).rejects.toThrow('Provider error 429');
    expect(calls()).toBe(1);
  });
});
