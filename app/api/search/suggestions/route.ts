import { NextRequest, NextResponse } from 'next/server';
import { getSearchSuggestions } from '@/lib/org-cache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';

  try {
    const results = await getSearchSuggestions(q, 6);
    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
      },
    });
  } catch (err) {
    console.error('Failed to get search suggestions:', err);
    return NextResponse.json(
      { organizations: [], contributors: [] },
      { status: 500 },
    );
  }
}
