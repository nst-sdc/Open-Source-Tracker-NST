import Link from 'next/link';
import { getAchieversKV } from '@/lib/kv-achievers';
import { getEventsKV } from '@/lib/kv-events';
import { UpcomingEvents } from './components/UpcomingEvents';
import { readSummaryCache } from '@/lib/summary-cache';

export const dynamic = 'force-dynamic';

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

  // Top contributors (top 3 from cache for the activity strip)
  const topContributors = cache?.summaries.slice(0, 5) ?? [];

  return (
    <main className="min-h-screen bg-[#030712]">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-purple-600/8 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[300px] bg-blue-600/5 blur-[100px] rounded-full" />
      </div>

      {/* Hero */}
      <div className="relative flex flex-col items-center justify-center text-center px-4 pt-20 pb-10">
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-purple-300/70 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          {activeContributorsCount > 0 ? `${activeContributorsCount} active contributor${activeContributorsCount !== 1 ? 's' : ''}` : 'Open Source at NST'}
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
          Built in public.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
            Celebrated together.
          </span>
        </h1>

        <p className="text-white/40 text-lg mb-10 max-w-xl leading-relaxed">
          Tracking every pull request merged and issue resolved. Celebrating the collective impact of Newton School of Technology&apos;s open-source developer community.
        </p>

        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/contributors"
            className="inline-flex items-center gap-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-8 py-3.5 rounded-full transition-all shadow-lg shadow-purple-900/30 hover:shadow-purple-900/50 hover:-translate-y-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            View Contributors
          </Link>
          <Link
            href="/achievers"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white/[0.04] border border-white/[0.1] text-white/70 font-medium hover:bg-white/[0.07] hover:text-white transition-all"
          >
            🏆 Hall of Fame
          </Link>
        </div>
      </div>

      {/* Live stats strip */}
      {totalPRs > 0 && (
        <div className="relative max-w-4xl mx-auto px-4 mb-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Students', value: totalStudents, color: 'text-white/70' },
              { label: 'Active Contributors', value: activeContributorsCount, color: 'text-purple-400' },
              { label: 'Total PRs', value: totalPRs, color: 'text-white' },
              { label: 'Merged', value: totalMerged, color: 'text-emerald-400' },
            ].map((s) => (
              <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl px-4 py-5 text-center">
                <div className={`text-3xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-white/30 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top contributors preview */}
      {topContributors.length > 0 && (
        <div className="relative max-w-3xl mx-auto px-4 mb-14">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white/50 text-sm font-medium uppercase tracking-wider">Top Contributors</h2>
            <Link href="/contributors" className="text-purple-400/60 text-xs hover:text-purple-400 transition-colors">
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {topContributors.map((s) => (
              <Link
                key={s.profile.login}
                href={`/contributors/${s.profile.login}`}
                className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.025] border border-white/[0.07] sys-card-hover"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.profile.avatar_url} alt={s.profile.login} className="w-8 h-8 rounded-full ring-1 ring-white/10 group-hover:ring-purple-500/30 transition-all" />
                <div className="flex-1 min-w-0">
                  <div className="text-white/80 text-sm font-medium truncate group-hover:text-white transition-colors">
                    {s.profile.name ?? s.profile.login}
                  </div>
                  <div className="text-white/25 text-xs">@{s.profile.login}</div>
                </div>
                <div className="flex items-center gap-3 text-xs flex-shrink-0">
                  <span title="Ranking score" className="text-amber-400 font-semibold tabular-nums px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    {s.scoreMergedPRs.toFixed(1)}
                  </span>
                  <span className="text-emerald-400 font-medium tabular-nums">{s.mergedPRs} merged</span>
                  <span className="text-white/15 group-hover:text-purple-400 transition-colors">→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* NST achievers strip */}
      {achievers.length > 0 && (
        <div className="relative max-w-3xl mx-auto px-4 mb-14">
          <div className="rounded-2xl border border-yellow-500/15 bg-yellow-500/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <div className="text-yellow-400 text-xs font-semibold uppercase tracking-wider mb-1">Hall of Fame</div>
                <h2 className="text-white font-bold text-lg">NST students in top programs</h2>
              </div>
              <Link href="/achievers" className="text-yellow-400/60 text-xs hover:text-yellow-400 transition-colors">
                View all →
              </Link>
            </div>
            <div className="flex flex-wrap gap-3 mb-5">
              {[
                { label: 'Achievers', value: achievers.length },
                { label: 'Selections', value: totalSelections },
                { label: 'Programs', value: programSet.size },
                ...(gsocCount > 0 ? [{ label: 'GSoC', value: gsocCount }] : []),
              ].map((s) => (
                <div key={s.label} className="bg-white/[0.04] border border-yellow-500/10 rounded-xl px-4 py-2">
                  <div className="text-xl font-bold text-yellow-400 tabular-nums">{s.value}</div>
                  <div className="text-white/30 text-xs">{s.label}</div>
                </div>
              ))}
            </div>
            {/* Program badges */}
            <div className="flex flex-wrap gap-2">
              {[...programSet].map((prog) => (
                <span key={prog} className="text-xs px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/40">
                  {prog}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Newton School Stories */}
      <div className="relative max-w-3xl mx-auto px-4 mb-14">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">Newton School Stories</div>
            <h2 className="text-white font-bold text-xl tracking-tight">Built by our Community</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Termstory */}
          <a
            href="https://github.com/bitflicker64/Termstory"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/[0.07] hover:bg-white/[0.04] hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/5 hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">🐧</span>
                <div>
                  <h3 className="font-bold text-white text-sm group-hover:text-white transition-colors">Termstory</h3>
                  <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">Memory Engine</span>
                </div>
              </div>
              <p className="text-white/60 text-[11px] leading-relaxed mb-4">
                Turns your terminal history into a searchable, AI-narrated timeline of your development life. Recover commands, correlate Git commits, and visualize your terminal work.
              </p>
              <div className="flex flex-wrap gap-1 mb-4">
                {['Python', 'TUI', 'Shell-History', 'CLI'].map((t) => (
                  <span key={t} className="text-[9px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-white/40">
              <span className="flex items-center gap-1.5">
                <img
                  src="https://avatars.githubusercontent.com/u/211528427?v=4"
                  alt="bitflicker64"
                  className="w-4 h-4 rounded-full"
                />
                Built by <strong className="text-white/60">KAI (@bitflicker64)</strong>
              </span>
              <span className="text-purple-400 group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </a>

          {/* Card 2: Filedrop */}
          <a
            href="https://github.com/Dreamstick9/filedrop"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/[0.07] hover:bg-white/[0.04] hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">📦</span>
                <div>
                  <h3 className="font-bold text-white text-sm group-hover:text-white transition-colors">filedrop</h3>
                  <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">File Sharing</span>
                </div>
              </div>
              <p className="text-white/60 text-[11px] leading-relaxed mb-4">
                Instantly host encrypted files locally with QR codes for mobile transfer. Features AES-256-GCM browser encryption, ephemeral URLs, and DDoS protection.
              </p>
              <div className="flex flex-wrap gap-1 mb-4">
                {['JavaScript', 'Node.js', 'AES-256', 'Crypto'].map((t) => (
                  <span key={t} className="text-[9px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-white/40">
              <span className="flex items-center gap-1.5">
                <img
                  src="https://avatars.githubusercontent.com/u/222502230?v=4"
                  alt="Dreamstick9"
                  className="w-4 h-4 rounded-full"
                />
                Built by <strong className="text-white/60">Dreamstick (@Dreamstick9)</strong>
              </span>
              <span className="text-blue-400 group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </a>
        </div>
      </div>

      {/* Quick nav strip */}
      <div className="relative max-w-5xl mx-auto px-4 mb-16">
        <div className="flex flex-wrap justify-center gap-3">
          {[
            { label: 'Contributors', href: '/contributors', icon: '👥', desc: 'Track all PRs' },
            { label: 'Hall of Fame', href: '/achievers',    icon: '🏆', desc: 'Top programs' },
            { label: 'Programs',     href: '/programs',     icon: '🚀', desc: 'GSoC, LFX & more' },
            { label: 'Get Started',  href: '/get-started',  icon: '📖', desc: 'Start contributing' },
            { label: 'Common Issues', href: '/issues',      icon: '🔧', desc: 'Git guides' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex flex-col items-center gap-1 px-5 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all min-w-[100px]"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium text-white/60">{item.label}</span>
              <span className="text-[10px] text-white/25">{item.desc}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Upcoming sessions + deadlines */}
      <UpcomingEvents events={events} />
    </main>
  );
}
