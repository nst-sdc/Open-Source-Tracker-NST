/**
 * The stream protocol between /api/agent and the console. These tests pin
 * the encoding, the parser's tolerance of split and malformed frames, and
 * the narrowing that keeps a half-formed `done` from ending a run early.
 */
import { describe, it, expect } from 'vitest';
import {
  createAgentEventParser,
  encodeAgentEvent,
  parseAgentEvent,
  readAgentEvents,
  toolLabel,
  type AgentEvent,
} from './agent-events';

const DONE: AgentEvent = {
  type: 'done',
  reply: 'hello',
  toolsUsed: ['web_search'],
  iterations: 2,
  sessionId: '11111111-2222-3333-4444-555555555555',
  sessionTitle: 'hi',
  remembered: true,
  engine: 'ts',
  ms: 1234,
};

describe('encodeAgentEvent', () => {
  it('emits a named SSE frame terminated by a blank line', () => {
    const frame = encodeAgentEvent({ type: 'status', text: 'Thinking' });
    expect(frame).toBe('event: status\ndata: {"type":"status","text":"Thinking"}\n\n');
  });

  it('round-trips every event type through the parser', () => {
    const events: AgentEvent[] = [
      { type: 'status', text: 'Thinking' },
      { type: 'tool_start', id: 'c1', name: 'web_search', label: 'Searching the web' },
      { type: 'tool_end', id: 'c1', name: 'web_search', ok: true, ms: 800 },
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo — “quotes” and 🎉' },
      DONE,
      { type: 'error', code: 'provider_error', error: 'nope', retryAfter: 60 },
    ];
    const parser = createAgentEventParser();
    const out = parser.push(events.map(encodeAgentEvent).join(''));
    expect(out).toEqual(events);
  });
});

describe('createAgentEventParser', () => {
  it('holds a frame split across chunks until it is complete', () => {
    const parser = createAgentEventParser();
    const frame = encodeAgentEvent({ type: 'delta', text: 'abc' });
    expect(parser.push(frame.slice(0, 20))).toEqual([]);
    expect(parser.push(frame.slice(20))).toEqual([{ type: 'delta', text: 'abc' }]);
  });

  it('ignores keepalive comments and blank frames', () => {
    const parser = createAgentEventParser();
    expect(parser.push(': keepalive\n\n\n\n')).toEqual([]);
  });

  it('drops malformed JSON and unknown types without stopping', () => {
    const parser = createAgentEventParser();
    const out = parser.push(
      'data: {not json\n\n' +
        'data: {"type":"mystery","x":1}\n\n' +
        encodeAgentEvent({ type: 'status', text: 'ok' }),
    );
    expect(out).toEqual([{ type: 'status', text: 'ok' }]);
  });

  it('parses a frame that has no event: line', () => {
    const parser = createAgentEventParser();
    expect(parser.push('data: {"type":"delta","text":"x"}\n\n')).toEqual([{ type: 'delta', text: 'x' }]);
  });
});

describe('parseAgentEvent', () => {
  it('rejects a done event missing its reply or session', () => {
    expect(parseAgentEvent({ type: 'done', sessionId: 'x' })).toBeNull();
    expect(parseAgentEvent({ type: 'done', reply: 'x' })).toBeNull();
  });

  it('fills defaults for optional done fields', () => {
    const parsed = parseAgentEvent({ type: 'done', reply: 'r', sessionId: 's' });
    expect(parsed).toEqual({
      type: 'done',
      reply: 'r',
      toolsUsed: [],
      iterations: 0,
      sessionId: 's',
      sessionTitle: '',
      remembered: true,
      engine: 'ts',
      ms: 0,
    });
  });

  it('filters non-string tool names out of toolsUsed', () => {
    const parsed = parseAgentEvent({ type: 'done', reply: 'r', sessionId: 's', toolsUsed: ['a', 1, null] });
    expect(parsed && parsed.type === 'done' ? parsed.toolsUsed : null).toEqual(['a']);
  });

  it('rejects non-objects and events with the wrong field types', () => {
    expect(parseAgentEvent(null)).toBeNull();
    expect(parseAgentEvent('delta')).toBeNull();
    expect(parseAgentEvent({ type: 'delta', text: 5 })).toBeNull();
    expect(parseAgentEvent({ type: 'tool_start', id: 'c', name: 'x' })).toBeNull();
  });
});

describe('readAgentEvents', () => {
  it('keeps a multi-byte character that straddles two chunks intact', async () => {
    const frame = encodeAgentEvent({ type: 'delta', text: 'café 🎉' });
    const bytes = new TextEncoder().encode(frame);
    // Split inside the 4-byte emoji.
    const cut = bytes.length - 6;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const seen: AgentEvent[] = [];
    await readAgentEvents(body, (e) => seen.push(e));
    expect(seen).toEqual([{ type: 'delta', text: 'café 🎉' }]);
  });

  it('flushes a final frame that lacks the trailing blank line', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"status","text":"end"}\n\n'));
        controller.close();
      },
    });
    const seen: AgentEvent[] = [];
    await readAgentEvents(body, (e) => seen.push(e));
    expect(seen).toEqual([{ type: 'status', text: 'end' }]);
  });
});

describe('toolLabel', () => {
  it('has a human label for every registered tool', async () => {
    const { TOOLS } = await import('./agent-tools');
    for (const tool of TOOLS) {
      expect(toolLabel(tool.name, 'running')).not.toMatch(/^Running /);
      expect(toolLabel(tool.name, 'done')).not.toMatch(/^ran /);
    }
  });

  it('falls back to a readable form for an unknown tool', () => {
    expect(toolLabel('do_thing', 'running')).toBe('Running do thing');
    expect(toolLabel('do_thing', 'done')).toBe('ran do thing');
  });
});
