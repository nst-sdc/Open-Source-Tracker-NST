import { describe, it, expect, vi } from 'vitest';
vi.mock('./kv', () => {
  let mem: Record<string, unknown> = {};
  return {
    kvConfigured: () => false,
    kvPipeline: vi.fn(),
    kvGet: vi.fn(async (k: string) => mem[k] ?? null),
    kvSet: vi.fn(async (k: string, v: unknown) => { mem[k] = JSON.parse(JSON.stringify(v)); return true; }),
    __reset: () => { mem = {}; },
  };
});
import { runCommands, hashEntries, withLock } from './kv-commands';

describe('runCommands (development fallback)', () => {
  it('implements hashes, NX/PX strings and DEL', async () => {
    const t0 = 1_000_000;
    let r = await runCommands([['HSET', 'h', 'a', '1', 'b', '2'], ['HSET', 'h', 'a', '9'], ['HGET', 'h', 'a'], ['HGET', 'h', 'zz'], ['HLEN', 'h'], ['HGETALL', 'h']], t0);
    expect(r.results).toEqual([2, 0, '9', null, 2, ['a', '9', 'b', '2']]);
    expect(hashEntries(r.results[5])).toEqual({ a: '9', b: '2' });
    r = await runCommands([['HDEL', 'h', 'a', 'nope'], ['HLEN', 'h']], t0);
    expect(r.results).toEqual([1, 1]);
    r = await runCommands([['SET', 'k', 'v1', 'NX', 'PX', '1000'], ['SET', 'k', 'v2', 'NX', 'PX', '1000'], ['GET', 'k']], t0);
    expect(r.results).toEqual(['OK', null, 'v1']);
    r = await runCommands([['SET', 'k', 'v3', 'NX', 'PX', '1000'], ['GET', 'k']], t0 + 1001);
    expect(r.results).toEqual(['OK', 'v3']);
    r = await runCommands([['DEL', 'k', 'h'], ['GET', 'k'], ['HLEN', 'h']], t0 + 1001);
    expect(r.results).toEqual([2, null, 0]);
  });
});

describe('withLock', () => {
  it('runs the work under the lock, releases it, and returns null when the lock stays busy', async () => {
    await runCommands([['DEL', 'lock:t']]);
    expect(await withLock('t', 60_000, async () => 'ran')).toBe('ran');
    expect((await runCommands([['GET', 'lock:t']])).results[0]).toBeNull();
    await runCommands([['SET', 'lock:t', 'someone-else', 'NX', 'PX', '60000']]);
    expect(await withLock('t', 60_000, async () => 'ran', 2, 1)).toBeNull();
    expect((await runCommands([['GET', 'lock:t']])).results[0]).toBe('someone-else');
  });
});
