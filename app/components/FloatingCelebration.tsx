'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

interface WeeklyContributor {
  username: string;
  name: string;
  avatarUrl: string;
  mergedCount: number;
  totalCount: number;
  issuesCount: number;
}

export function FloatingCelebration() {
  const [contributors, setContributors] = useState<WeeklyContributor[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch('/api/weekly-contributors')
      .then((res) => res.json())
      .then((data) => {
        if (data.contributors) {
          setContributors(data.contributors);
        }
      })
      .catch((err) => console.error('Failed to fetch weekly contributors for celebration:', err));
  }, []);

  if (!mounted || contributors.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none opacity-45 hover:opacity-80 transition-opacity duration-500">
      {contributors.map((c, index) => {
        // Deterministic but random-looking properties based on username hash
        const hash = c.username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        
        // Random layout coordinates and speeds
        const size = 42 + (hash % 16); // 42px to 58px size
        const left = 5 + (hash * 7) % 90; // 5% to 95% horizontal placement
        const delay = (hash % 8) * -2.5; // Negative delay so they are pre-distributed
        const duration = 22 + (hash % 12); // 22s to 34s duration
        const drift = 15 + (hash % 25); // -15px to +25px horizontal drift

        const totalContributions = c.totalCount + c.issuesCount;

        return (
          <div
            key={c.username}
            className="absolute bottom-[-100px] pointer-events-auto group cursor-pointer"
            style={{
              left: `${left}%`,
              animation: `floatUp ${duration}s linear infinite`,
              animationDelay: `${delay}s`,
              '--drift-x': `${drift}px`,
            } as React.CSSProperties}
          >
            {/* Bubble element */}
            <div className="relative flex items-center justify-center rounded-full bg-panel border border-line p-1 shadow-card hover:bg-violet-0 hover:border-violet-200 hover:scale-125 hover:shadow-card transition-all duration-300 backdrop-blur-[2px]">
              <img
                src={c.avatarUrl}
                alt={c.username}
                width={size}
                height={size}
                style={{ width: `${size}px`, height: `${size}px` }}
                className="rounded-full object-cover grayscale opacity-65 group-hover:grayscale-0 group-hover:opacity-100 transition-all"
              />

              {/* Weekly highlight indicator */}
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gradient-to-r from-violet-500 to-brand-500 text-[9px] font-bold text-white flex items-center justify-center border border-ground group-hover:scale-110 transition-transform">
                {totalContributions}
              </span>

              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-ink border border-line-heavy rounded-xl px-3 py-2 text-center pointer-events-none opacity-0 scale-90 translate-y-1 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 transition-all duration-200 z-50 shadow-2xl min-w-[120px] shadow-black/80">
                <div className="text-ground text-[11px] font-bold truncate max-w-[100px]">{c.name}</div>
                <div className="text-ground/70 text-[9px] font-mono mt-0.5">@{c.username}</div>
                <div className="text-ground/60 text-[9px] mt-1 pt-1 border-t border-ink-soft/40 flex flex-col gap-0.5 whitespace-nowrap">
                  {c.mergedCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success-400 flex-shrink-0" />
                      {c.mergedCount} merged PRs
                    </span>
                  )}
                  {c.totalCount - c.mergedCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0" />
                      {c.totalCount - c.mergedCount} open PRs
                    </span>
                  )}
                  {c.issuesCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-300 flex-shrink-0" />
                      {c.issuesCount} issue{c.issuesCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-ink-soft/40" />
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-ink" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
