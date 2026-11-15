'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shown on a local checkout while the in-process refresh loop
 * (lib/local-auto-refresh.ts) is still filling the leaderboard in from
 * GitHub. Re-renders the page every few seconds so new data appears without
 * anyone pressing reload, and disappears once every student has real data.
 */
export function BootstrapBanner({ populated, total }: { populated: number; total: number }) {
  const router = useRouter();
  const [dots, setDots] = useState(0);
  const done = total > 0 && populated >= total;

  useEffect(() => {
    if (done) return;
    const refresh = setInterval(() => router.refresh(), 10_000);
    const anim = setInterval(() => setDots((d) => (d + 1) % 4), 600);
    return () => {
      clearInterval(refresh);
      clearInterval(anim);
    };
  }, [done, router]);

  if (done) return null;
  const pct = total > 0 ? Math.round((populated / total) * 100) : 0;

  return (
    <div className="mb-5 rounded-2xl border border-brand-100 bg-brand-0 px-5 py-4" role="status" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13.5px] font-[650] text-brand-700">
          Filling in the leaderboard from GitHub{'.'.repeat(dots)}
        </div>
        <div className="text-[12.5px] text-brand-700/80">
          {populated.toLocaleString()} of {total.toLocaleString()} students have real data ({pct}%)
        </div>
      </div>
      <div className="mt-2.5 h-1.5 rounded-full bg-brand-100/70 overflow-hidden">
        <div className="h-full bg-brand-500 transition-all duration-700" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-brand-700/80">
        This happens automatically on a local setup; the page updates itself every few seconds. With a GITHUB_TOKEN in
        .env.local it takes minutes, without one it takes hours. Students with genuinely zero contributions count as done
        once their profile has been checked.
      </p>
    </div>
  );
}
