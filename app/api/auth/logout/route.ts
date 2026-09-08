import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPublicOrigin } from '@/lib/request-origin';
import { invalidateViewerCache } from '@/lib/session';
import { removePoolToken } from '@/lib/github';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('github_oauth_token')?.value;

  if (token) {
    // Evict by token VALUE, not by username. The `github_username` cookie is
    // gone (it was forgeable, and identity now comes from GitHub), so a
    // username-keyed delete would leave a live OAuth token sitting in the
    // shared pool forever after every logout.
    try {
      await removePoolToken(token);
    } catch (error) {
      // Best-effort: logout must succeed even if KV is unreachable.
      console.error('Failed to evict token from token pool on logout:', error);
    }
    // Drop the cached identity immediately, so signing out is not followed
    // by up to ten minutes of continued access.
    await invalidateViewerCache(token);
  }

  cookieStore.delete('github_oauth_token');
  // Legacy: written by older builds, no longer read anywhere. Delete it so
  // browsers stop carrying a cookie that used to be a bypass.
  cookieStore.delete('github_username');

  return NextResponse.redirect(new URL('/', getPublicOrigin(request)));
}
