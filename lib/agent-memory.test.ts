/**
 * Per-session memory tests.
 *
 * The property that matters most here is isolation: one student must never be
 * able to read another's chat, even knowing its id. That is enforced by
 * namespacing the KV key under the verified user id rather than by a check,
 * so the test asserts it at the storage layer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const kvStore = new Map<string, unknown>();

vi.mock('@/lib/kv', () => ({
  kvGet: async (key: string) => (kvStore.has(key) ? kvStore.get(key) : null),
  kvSet: async (key: string, value: unknown) => {
    kvStore.set(key, value);
    return true;
  },
  kvDel: async (key: string) => {
    kvStore.delete(key);
    return true;
  },
}));

import {
  MAX_NOTES,
  MAX_SESSIONS_PER_USER,
  MAX_TRANSCRIPT_MESSAGES,
  appendExchange,
  deleteSession,
  describeMemory,
  isValidSessionId,
  listSessions,
  loadSession,
  newSession,
  remember,
  saveSession,
  titleFrom,
} from './agent-memory';

beforeEach(() => kvStore.clear());

describe('session ids', () => {
  it('mints ids that validate', () => {
    expect(isValidSessionId(newSession('hi').id)).toBe(true);
  });

  it('rejects anything that is not a uuid', () => {
    // These are interpolated into a KV key, so a wildcard or a colon would
    // let a client reshape the keyspace.
    for (const bad of ['', 'a', '../other', 'kairi:sess:9:x', '*', null, 42, {}]) {
      expect(isValidSessionId(bad)).toBe(false);
    }
  });
});

describe('isolation between students', () => {
  it('does not return another student’s session, even with the right id', async () => {
    const s = newSession('my private question');
    await saveSession('user-1', appendExchange(s, 'secret question', 'secret answer'));

    // Same id, different student.
    expect(await loadSession('user-2', s.id)).toBeNull();
    // The owner still sees it.
    expect(await loadSession('user-1', s.id)).not.toBeNull();
  });

  it('keeps session lists separate', async () => {
    await saveSession('user-1', appendExchange(newSession('a'), 'a', 'a'));
    await saveSession('user-2', appendExchange(newSession('b'), 'b', 'b'));
    expect(await listSessions('user-1')).toHaveLength(1);
    expect(await listSessions('user-2')).toHaveLength(1);
    expect((await listSessions('user-1'))[0].title).toBe('a');
  });
});

describe('transcript', () => {
  it('round-trips an exchange', async () => {
    const s = appendExchange(newSession('how do I start?'), 'how do I start?', 'Pick an issue.');
    await saveSession('u', s);
    const back = await loadSession('u', s.id);
    expect(back?.messages.map((m) => m.content)).toEqual(['how do I start?', 'Pick an issue.']);
  });

  it('keeps only the newest turns', async () => {
    let s = newSession('start');
    for (let i = 0; i < 20; i++) s = appendExchange(s, `q${i}`, `a${i}`);
    expect(s.messages).toHaveLength(MAX_TRANSCRIPT_MESSAGES);
    expect(s.messages.at(-1)?.content).toBe('a19');
    expect(s.messages.at(0)?.content).not.toBe('q0');
  });

  it('strips control characters from stored text', async () => {
    const NUL = String.fromCharCode(0);
    const UNIT_SEP = String.fromCharCode(31);
    const s = appendExchange(newSession('x'), `clean${NUL}ish`, `also${UNIT_SEP}fine`);
    await saveSession('u', s);
    const back = await loadSession('u', s.id);
    expect(back?.messages[0].content).toBe('cleanish');
    expect(back?.messages[1].content).toBe('alsofine');
  });

  it('discards malformed stored data instead of throwing', async () => {
    const s = newSession('x');
    await saveSession('u', s);
    // Simulate corruption.
    kvStore.set(`kairi:sess:u:${s.id}`, { messages: 'not-an-array', notes: 7, title: 42 });
    const back = await loadSession('u', s.id);
    expect(back?.messages).toEqual([]);
    expect(back?.notes).toEqual([]);
    expect(back?.title).toBe('New chat');
  });
});

describe('notes', () => {
  it('remembers a fact once', () => {
    let s = newSession('x');
    s = remember(s, 'Working on facebook/react issue #123');
    s = remember(s, 'Working on facebook/react issue #123');
    expect(s.notes).toHaveLength(1);
  });

  it('ignores empty notes', () => {
    expect(remember(newSession('x'), '   ').notes).toHaveLength(0);
  });

  it('caps how much it carries forward', () => {
    let s = newSession('x');
    for (let i = 0; i < 30; i++) s = remember(s, `note ${i}`);
    expect(s.notes).toHaveLength(MAX_NOTES);
    expect(s.notes.at(-1)).toBe('note 29');
  });
});

describe('titles', () => {
  it('uses the opening question', () => {
    expect(titleFrom('How do I fix a merge conflict?')).toBe('How do I fix a merge conflict?');
  });

  it('drops a bare greeting prefix', () => {
    expect(titleFrom('hey, how do I fork a repo?')).toBe('how do I fork a repo?');
  });

  it('falls back when there is nothing to name it after', () => {
    expect(titleFrom('   ')).toBe('New chat');
  });

  it('truncates a long question', () => {
    const t = titleFrom('x'.repeat(200));
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('session index', () => {
  it('orders most-recently-updated first', async () => {
    const a = appendExchange(newSession('first'), 'q', 'a');
    await saveSession('u', a);
    const b = appendExchange(newSession('second'), 'q', 'a');
    await saveSession('u', b);
    const list = await listSessions('u');
    expect(list[0].title).toBe('second');
  });

  it('caps the list', async () => {
    for (let i = 0; i < MAX_SESSIONS_PER_USER + 5; i++) {
      await saveSession('u', appendExchange(newSession(`chat ${i}`), 'q', 'a'));
    }
    expect(await listSessions('u')).toHaveLength(MAX_SESSIONS_PER_USER);
  });

  it('does not duplicate an entry when a session is saved twice', async () => {
    const s = appendExchange(newSession('one'), 'q', 'a');
    await saveSession('u', s);
    await saveSession('u', appendExchange(s, 'q2', 'a2'));
    expect(await listSessions('u')).toHaveLength(1);
  });
});

describe('deleteSession', () => {
  it('removes the chat and its index entry', async () => {
    const s = appendExchange(newSession('bye'), 'q', 'a');
    await saveSession('u', s);
    expect(await deleteSession('u', s.id)).toBe(true);
    expect(await loadSession('u', s.id)).toBeNull();
    expect(await listSessions('u')).toHaveLength(0);
  });

  it('refuses an invalid id', async () => {
    expect(await deleteSession('u', 'not-a-uuid')).toBe(false);
  });
});

describe('describeMemory', () => {
  it('says nothing when there is nothing to say', () => {
    expect(describeMemory(null)).toBe('');
    expect(describeMemory(newSession('x'))).toBe('');
  });

  it('reports the repo and notes', () => {
    let s = newSession('x');
    s = { ...s, repo: 'facebook/react' };
    s = remember(s, 'wants a good first issue');
    const text = describeMemory(s);
    expect(text).toContain('facebook/react');
    expect(text).toContain('wants a good first issue');
  });
});


describe('message bodies keep their Markdown structure', () => {
  it('preserves newlines and tabs but strips other control characters', async () => {
    const { appendExchange, newSession } = await import('./agent-memory');
    const answer = 'Direct answer.\n\n## Steps\n\n1. one\n\n```bash\n\tnpm test\n```';
    const s = appendExchange(newSession('q'), 'q\r\nline 2', answer + '');
    expect(s.messages[0].content).toBe('q\nline 2');
    expect(s.messages[1].content).toBe(answer);
  });

  it('stores an assistant answer longer than a student message', async () => {
    const { appendExchange, newSession, MAX_MESSAGE_CHARS, MAX_ASSISTANT_MESSAGE_CHARS } = await import('./agent-memory');
    const long = 'x'.repeat(MAX_ASSISTANT_MESSAGE_CHARS + 100);
    const s = appendExchange(newSession('q'), long, long);
    expect(s.messages[0].content).toHaveLength(MAX_MESSAGE_CHARS);
    expect(s.messages[1].content).toHaveLength(MAX_ASSISTANT_MESSAGE_CHARS);
  });

  it('elides long past answers when building model history', async () => {
    const { forHistory, HISTORY_ASSISTANT_CHARS } = await import('./agent-memory');
    const short = { role: 'assistant' as const, content: 'short', at: 0 };
    expect(forHistory(short)).toBe('short');
    const long = { role: 'assistant' as const, content: 'y'.repeat(HISTORY_ASSISTANT_CHARS + 50), at: 0 };
    expect(forHistory(long)).toContain('omitted from history');
    expect(forHistory(long).length).toBeLessThan(HISTORY_ASSISTANT_CHARS + 60);
    const user = { role: 'user' as const, content: 'z'.repeat(HISTORY_ASSISTANT_CHARS + 50), at: 0 };
    expect(forHistory(user)).toBe(user.content);
  });
});
