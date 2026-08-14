import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPublicOrigin } from '@/lib/request-origin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete('github_oauth_token');

  return NextResponse.redirect(new URL('/', getPublicOrigin(request)));
}
