import { NextResponse } from 'next/server';
import { performIncrementalRefresh } from '@/lib/incremental-refresh';

export const dynamic = 'force-dynamic';

// Batch size auto-scales with the number of available GitHub tokens (system +
// pool), each processed concurrently — this bounds wall-clock time per tick
// regardless of pool size, so give it real headroom under the platform's
// serverless timeout.
export const maxDuration = 180;

export async function POST() {
  try {
    const result = await performIncrementalRefresh();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Incremental Refresh] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await performIncrementalRefresh();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Incremental Refresh] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
