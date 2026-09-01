import Link from 'next/link';
import { getAchieversKV } from '@/lib/kv-achievers';
import { getEventsKV } from '@/lib/kv-events';
import { UpcomingEvents } from './components/UpcomingEvents';
import { readSummaryCache } from '@/lib/summary-cache';

export const dynamic = 'force-dynamic';

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2.5 7.5 6 10.5 12 4l6 6.5 3.5-3v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9Z" />
    </svg>
  );
}

function MergeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}

function RankChip({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 bg-gold-400 text-ink rounded-full px-2 py-0.5 text-[11.5px] font-[650] tabular-nums">
        <CrownIcon className="w-3 h-3" />{rank}
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 bg-line-strong text-ink-mid rounded-full px-2 py-0.5 text-[11.5px] font-[650] tabular-nums">
        <CrownIcon className="w-3 h-3" />{rank}
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 bg-warning-200 text-warning-800 rounded-full px-2 py-0.5 text-[11.5px] font-[650] tabular-nums">
        <CrownIcon className="w-3 h-3" />{rank}
      </span>
    );
  }
  return <span className="text-[13px] font-[650] text-ink-soft tabular-nums w-6 text-center">{rank}</span>;
}

export default async function Home() {
  const events = await getEventsKV();
  const achievers = await getAchieversKV();
  const cache = await readSummaryCache();

  // Stats from achievers
  const programSet = new Set(achievers.flatMap((a) => a.programs.map((p) => p.name)));
  const gsocCount = achievers.filter((a) => a.programs.some((p) => p.name === 'GSoC')).length;
  const totalSelections = achievers.reduce((n, a) => n + a.programs.length, 0);

  // Stats from summary cache
  const totalStudents = cache?.summaries.length ?? 0;
  const activeContributorsCount = cache?.summaries.filter((s) => s.totalPRs > 0 || (s.issuesCount ?? 0) > 0).length ?? 0;
  const totalMerged = cache?.summaries.reduce((s, c) => s + c.mergedPRs, 0) ?? 0;
  const totalPRs = cache?.summaries.reduce((s, c) => s + c.totalPRs, 0) ?? 0;

  // Top contributors (top 5 from cache for the leaderboard preview card)
  const topContributors = cache?.summaries.slice(0, 5) ?? [];

  return (
    <main className="min-h-screen bg-ground">
      {/* Announcement banner */}
      <div className="bg-brand-solid">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-[52px] flex items-center gap-3">
          <MergeIcon className="w-4 h-4 text-white shrink-0" />
          <p className="text-white text-[13.5px] font-[550] truncate">
            New here? Add yourself to the tracker and every merged PR starts counting.
          </p>
          <Link
            href="/join"
            className="ml-auto shrink-0 flex items-center h-[34px] px-4 rounded-[9px] bg-ground text-brand-600 text-[13px] font-[650] hover:bg-brand-0 transition-colors"
          >
            Join now
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-12 md:pt-16 pb-4 flex flex-col lg:flex-row gap-10 lg:gap-12 items-start">
        <div className="flex-1 pt-2">
          <span className="inline-flex items-center gap-2 bg-panel border border-line rounded-full px-3.5 py-1.5 text-[12.5px] font-[550] text-ink-mid">
            <span className="live-dot w-[7px] h-[7px] rounded-full bg-success-400" />
            {activeContributorsCount > 0
              ? `${activeContributorsCount} student${activeContributorsCount !== 1 ? 's' : ''} shipping this semester`
              : 'Open source at Newton School of Technology'}
          </span>

          <h1 className="mt-5 text-[38px] md:text-[46px] font-[650] leading-[1.12] tracking-[-0.02em] text-ink">
            Built in public.
            <br />
            <span className="text-brand-500">Celebrated together.</span>
          </h1>

          <p className="mt-5 text-[15.5px] md:text-base leading-relaxed text-ink-soft max-w-[540px]">
            Every pull request and issue from NST students — pulled straight from GitHub,
            filtered for spam, ranked by merged work. No self-reporting.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/contributors"
              className="flex items-center gap-2 h-[46px] px-5 rounded-[11px] bg-brand-solid hover:bg-brand-solid-hover text-white text-[14.5px] font-[550] shadow-brand-btn transition-colors"
            >
              View contributors
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/achievers"
              className="flex items-center gap-2 h-[46px] px-5 rounded-[11px] bg-ground border border-line-strong hover:bg-panel text-ink text-[14.5px] font-[550] transition-colors"
            >
              <svg className="w-4 h-4 text-gold-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
              Hall of Fame
            </Link>
          </div>
        </div>

        {/* Leaderboard preview card */}
        {topContributors.length > 0 && (
          <div className="w-full lg:w-[380px] shrink-0 bg-ground border border-line rounded-2xl shadow-card px-5 pt-4 pb-2">
            <div className="flex items-center justify-between pb-1.5">
              <h2 className="text-[15px] font-[650] text-ink">Top contributors</h2>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-[650] tracking-[0.05em] text-success-600 bg-success-0 rounded-full px-2.5 py-1">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-success-400" />
                LIVE
              </span>
            </div>
            {topContributors.map((s, i) => (
              <Link
                key={s.profile.login}
                href={`/contributors/${s.profile.login}`}
                className={`flex items-center gap-3 py-2.5 group ${i > 0 ? 'border-t border-panel' : ''}`}
              >
                <RankChip rank={i + 1} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.profile.avatar_url}
                  alt=""
                  className="w-8 h-8 rounded-full border border-line"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-[550] text-ink truncate group-hover:text-brand-600 transition-colors">
                    {s.profile.name ?? s.profile.login}
                  </div>
                  <div className="text-[11.5px] text-ink-soft truncate">@{s.profile.login}</div>
                </div>
                <span title="Ranking score" className="text-[11px] font-[650] text-gold-600 bg-gold-0 rounded-md px-1.5 py-0.5 tabular-nums shrink-0">
                  {s.scoreMergedPRs.toFixed(1)}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <MergeIcon className="w-3.5 h-3.5 text-success-600" />
                  <span className="text-[14px] font-[650] text-success-600 tabular-nums">{s.mergedPRs}</span>
                </span>
              </Link>
            ))}
            <Link
              href="/contributors"
              className="flex items-center justify-center gap-1 py-3 border-t border-panel text-[12.5px] font-[550] text-brand-600 hover:text-brand-500 transition-colors"
            >
              View the full leaderboard
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </div>

      {/* Stats */}
      {totalPRs > 0 && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              value: totalStudents, label: 'Students tracked', tile: 'bg-brand-0 text-brand-600',
              icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
              numClass: 'text-ink',
            },
            {
              value: activeContributorsCount, label: 'Active contributors', tile: 'bg-violet-0 text-violet-600',
              icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-2 9h5l-4 11 1-8H8l5-12z" /></svg>,
              numClass: 'text-ink',
            },
            {
              value: totalPRs, label: 'Pull requests', tile: 'bg-warning-0 text-warning-600',
              icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></svg>,
              numClass: 'text-ink',
            },
            {
              value: totalMerged, label: 'Merged PRs', tile: 'bg-success-0 text-success-600',
              icon: <MergeIcon className="w-4 h-4" />,
              numClass: 'text-success-600',
            },
          ].map((s) => (
            <div key={s.label} className="bg-ground border border-line rounded-2xl shadow-card p-5 flex flex-col gap-3.5">
              <span className={`w-9 h-9 rounded-[10px] flex items-center justify-center ${s.tile}`}>{s.icon}</span>
              <div>
                <div className={`text-[28px] leading-none font-[650] tabular-nums tracking-[-0.01em] ${s.numClass}`}>
                  {s.value.toLocaleString('en-IN')}
                </div>
                <div className="text-[12.5px] text-ink-soft mt-1.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hall of fame band */}
      {achievers.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-12">
          <div className="bg-ground border border-line rounded-2xl shadow-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <span className="w-11 h-11 rounded-xl bg-gold-0 text-gold-600 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-[17px] font-[650] text-ink">NST students in top programs</h2>
                  <p className="text-[13px] text-ink-soft mt-0.5">GSoC, LFX and beyond — selected from this leaderboard.</p>
                </div>
              </div>
              <Link href="/achievers" className="flex items-center gap-1.5 text-[13.5px] font-[550] text-brand-600 hover:text-brand-500 transition-colors">
                View the Hall of Fame
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="flex flex-wrap gap-3 mt-5">
              {[
                { label: 'Achievers', value: achievers.length },
                { label: 'Selections', value: totalSelections },
                { label: 'Programs', value: programSet.size },
                ...(gsocCount > 0 ? [{ label: 'GSoC', value: gsocCount }] : []),
              ].map((s) => (
                <div key={s.label} className="bg-panel rounded-xl px-4 py-2.5 min-w-[92px]">
                  <div className="text-xl font-[650] text-gold-600 tabular-nums">{s.value}</div>
                  <div className="text-ink-soft text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                {[...programSet].map((prog) => (
                  <span key={prog} className="text-xs font-[550] px-2.5 py-1 rounded-full bg-ground border border-line-strong text-ink-mid">
                    {prog}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Newton School Stories */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-12">
        <div className="flex items-center gap-3.5 mb-5">
          <span className="w-11 h-11 rounded-xl bg-brand-0 text-brand-600 flex items-center justify-center">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" />
            </svg>
          </span>
          <div>
            <h2 className="text-[17px] font-[650] text-ink">Built by our community</h2>
            <p className="text-[13px] text-ink-soft mt-0.5">Student projects, in the open.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Termstory */}
          <a
            href="https://github.com/bitflicker64/Termstory"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between p-5 rounded-2xl bg-ground border border-line shadow-card card-hover"
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🐧</span>
                <div>
                  <h3 className="font-[650] text-ink text-sm">Termstory</h3>
                  <span className="text-[10.5px] text-ink-soft font-[550] tracking-[0.06em] uppercase">Memory engine</span>
                </div>
              </div>
              <p className="text-ink-soft text-[12.5px] leading-relaxed mb-4">
                Turns your terminal history into a searchable, AI-narrated timeline of your development life.
                Recover commands, correlate Git commits, and visualize your terminal work.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {['Python', 'TUI', 'Shell-History', 'CLI'].map((t) => (
                  <span key={t} className="text-[10.5px] font-[550] px-2 py-0.5 rounded-md bg-panel text-ink-mid">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-panel flex items-center justify-between text-[11px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://avatars.githubusercontent.com/u/211528427?v=4" alt="bitflicker64" className="w-4 h-4 rounded-full" />
                Built by <strong className="text-ink-mid font-[600]">KAI (@bitflicker64)</strong>
              </span>
              <span className="text-brand-600 group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </a>

          {/* Card 2: Filedrop */}
          <a
            href="https://github.com/Dreamstick9/filedrop"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between p-5 rounded-2xl bg-ground border border-line shadow-card card-hover"
          >
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">📦</span>
                <div>
                  <h3 className="font-[650] text-ink text-sm">filedrop</h3>
                  <span className="text-[10.5px] text-ink-soft font-[550] tracking-[0.06em] uppercase">File sharing</span>
                </div>
              </div>
              <p className="text-ink-soft text-[12.5px] leading-relaxed mb-4">
                Instantly host encrypted files locally with QR codes for mobile transfer. Features AES-256-GCM
                browser encryption, ephemeral URLs, and DDoS protection.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {['JavaScript', 'Node.js', 'AES-256', 'Crypto'].map((t) => (
                  <span key={t} className="text-[10.5px] font-[550] px-2 py-0.5 rounded-md bg-panel text-ink-mid">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-panel flex items-center justify-between text-[11px] text-ink-soft">
              <span className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://avatars.githubusercontent.com/u/222502230?v=4" alt="Dreamstick9" className="w-4 h-4 rounded-full" />
                Built by <strong className="text-ink-mid font-[600]">Dreamstick (@Dreamstick9)</strong>
              </span>
              <span className="text-brand-600 group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </a>
        </div>
      </div>

      {/* Quick nav strip */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-12 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            {
              label: 'Contributors', href: '/contributors', desc: 'Track all PRs', tile: 'bg-brand-0 text-brand-600',
              icon: <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
            },
            {
              label: 'Hall of Fame', href: '/achievers', desc: 'Top programs', tile: 'bg-gold-0 text-gold-600',
              icon: <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>,
            },
            {
              label: 'Programs', href: '/programs', desc: 'GSoC, LFX & more', tile: 'bg-violet-0 text-violet-600',
              icon: <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>,
            },
            {
              label: 'Get Started', href: '/get-started', desc: 'Start contributing', tile: 'bg-success-0 text-success-600',
              icon: <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>,
            },
            {
              label: 'Common Issues', href: '/issues', desc: 'Git guides', tile: 'bg-warning-0 text-warning-600',
              icon: <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-ground border border-line shadow-card card-hover"
            >
              <span className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${item.tile}`}>{item.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-[550] text-ink truncate">{item.label}</span>
                <span className="block text-[11.5px] text-ink-soft truncate">{item.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Upcoming sessions + deadlines */}
      <div className="pt-8">
        <UpcomingEvents events={events} />
      </div>

      {/* Footer */}
      <div className="border-t border-line mt-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-7 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-ink-soft">
            Opensource Tracker · Newton School of Technology · refreshes every 15 minutes
          </p>
          <div className="flex items-center gap-5 text-[13px] font-[500]">
            <a href="https://github.com/nst-sdc/Open-Source-Tracker-NST" target="_blank" rel="noopener noreferrer" className="text-ink-soft hover:text-ink transition-colors">GitHub</a>
            <Link href="/get-started" className="text-ink-soft hover:text-ink transition-colors">Get started</Link>
            <Link href="/join" className="text-ink-soft hover:text-ink transition-colors">Join the tracker</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
