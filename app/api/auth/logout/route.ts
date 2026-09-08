import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPublicOrigin } from '@/lib/request-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const username = cookieStore.get('github_username')?.value;

  // Evict this user's token from the shared pool so a logged-out token can
  // no longer be picked up for refresh work. Best-effort: logout must
  // succeed even if KV is unreachable.
  if (username) {
    try {
      const { kvGet, kvSet } = await import('@/lib/kv');
      const poolKey = 'github_token_pool';
      const pool = (await kvGet<Record<string, string>>(poolKey)) || {};
      if (pool[username]) {
        delete pool[username];
        await kvSet(poolKey, pool);
      }
    } catch (error) {
      console.error('Failed to evict token from token pool on logout:', error);
    }
  }

  cookieStore.delete('github_oauth_token');
  cookieStore.delete('github_username');

  return NextResponse.redirect(new URL('/', getPublicOrigin(request)));
}
