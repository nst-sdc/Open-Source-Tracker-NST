import { getProgramMeta, type PersonEntry } from '@/lib/data';
import { getAchieversKV } from '@/lib/kv-achievers';
import { getStudentProfile, type GitHubUser } from '@/lib/github';
import { readProfileCache } from '@/lib/profile-cache';
import { getStudentsKV, type Student } from '@/lib/kv-students';
import Image from 'next/image';
import Link from 'next/link';

export const revalidate = 3600;
export const metadata = { title: 'Hall of Fame — Opensource Tracker NST' };

function InitialsAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const colors = [
    'from-purple-500 to-blue-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-pink-500 to-rose-500',
    'from-violet-500 to-purple-500',
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 ring-2 ring-white/10`}
    >
      <span className="text-white font-bold" style={{ fontSize: size * 0.35 }}>
        {initials}
      </span>
    </div>
  );
}

function AchieverCard({
  entry,
  profile,
  student,
  index,
}: {
  entry: PersonEntry;
  profile: GitHubUser | null;
  student?: Student;
  index: number;
}) {
  const displayName = profile?.name ?? entry.name ?? entry.github;
  const handle = profile?.login ?? entry.github;
  const bio = entry.headline ?? profile?.bio;

  const inner = (
    <div className="group relative bg-white/[0.025] border border-white/[0.07] rounded-2xl p-6 hover:bg-white/[0.055] hover:border-yellow-500/35 transition-all duration-300 hover:shadow-xl hover:shadow-yellow-500/10 hover:-translate-y-1 h-full">
      {index < 3 && (
        <div className="absolute top-4 right-4 text-lg">
          {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
        </div>
      )}

      <div className="flex items-start gap-4 mb-4">
        {profile ? (
          <Image
            src={profile.avatar_url}
            alt={displayName}
            width={56}
            height={56}
            unoptimized
            className="w-14 h-14 rounded-full ring-2 ring-white/10 group-hover:ring-yellow-500/30 transition-all object-cover flex-shrink-0"
          />
        ) : (
          <div className="group-hover:[--ring-color:rgba(234,179,8,0.3)] transition-all">
            <InitialsAvatar name={displayName} size={56} />
          </div>
        )}

        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className="font-semibold text-white/90 group-hover:text-white truncate transition-colors">
            {displayName}
          </h3>
          <p className="text-white/35 text-xs mt-0.5">@{handle}</p>
          {(student?.year || student?.campus) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {student.year && (
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                  {student.year}
                </span>
              )}
              {student.campus && (
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                  {student.campus}
                </span>
              )}
            </div>
          )}
          {bio && (
            <p className="text-white/40 text-xs mt-1.5 line-clamp-2 leading-relaxed">{bio}</p>
          )}
        </div>
      </div>

      {/* Program badges */}
      <div className="flex flex-wrap gap-1.5">
        {entry.programs.map((prog, i) => {
          const meta = getProgramMeta(prog.name);
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border max-w-full ${meta.bg} ${meta.color} ${meta.border}`}
              title={prog.org}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
              <span className="flex-shrink-0">{prog.name}</span>
              {prog.year && <span className="opacity-60 flex-shrink-0">{prog.year}</span>}
              {prog.org && <span className="opacity-50 truncate">· {prog.org}</span>}
            </span>
          );
        })}
      </div>

      {/* Project titles, one per program that has one */}
      {entry.programs.some((p) => p.project) && (
        <div className="mt-2.5 space-y-1">
          {entry.programs
            .filter((p) => p.project)
            .map((prog, i) => (
              <p key={i} className="text-white/30 text-[11px] leading-relaxed">
                <span className="text-white/45 font-medium">{prog.project}</span>
                {prog.description ? ` — ${prog.description}` : ''}
              </p>
            ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-white/20 text-xs group-hover:text-white/40 transition-colors">
          View achievements
        </span>
        <svg
          className="w-4 h-4 text-white/15 group-hover:text-yellow-400 group-hover:translate-x-0.5 transition-all"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );

  return (
    <div className="relative h-full">
      {profile ? (
        <Link href={`/achievers/${entry.github}`} className="block h-full">
          {inner}
        </Link>
      ) : (
        <div className="h-full">{inner}</div>
      )}

      {/* Sits outside the card's own <Link>/wrapper above — nesting an <a>
          inside it would be invalid HTML and would break the click target
          boundary between "open profile" and "open LinkedIn". */}
      {entry.linkedinUrl && (
        <a
          href={entry.linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Connect with ${displayName} on LinkedIn`}
          className="absolute top-6 left-[4.75rem] text-white/25 hover:text-[#0A66C2] transition-colors z-10"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.446-2.136 2.94v5.666H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
        </a>
      )}
    </div>
  );
}

export default async function AchieversPage() {
  const [entries, students] = await Promise.all([getAchieversKV(), getStudentsKV()]);

  const achievers = await Promise.all(
    entries.map(async (e) => {
      let profile = null;
      try {
        const cached = await readProfileCache(e.github);
        if (cached) {
          profile = cached.profile;
        } else {
          profile = await getStudentProfile(e.github);
        }
      } catch (err) {
        console.error(`Failed to load profile for achiever ${e.github}:`, err);
      }
      const student = students.find((s) => s.github.toLowerCase() === e.github.toLowerCase());
      return {
        entry: e,
        profile,
        student,
      };
    })
  );

  const programCount = achievers.reduce((n, a) => n + a.entry.programs.length, 0);
  const programSet = new Set(achievers.flatMap((a) => a.entry.programs.map((p) => p.name)));

  return (
    <main className="min-h-screen bg-[#030712]">
      <div className="relative overflow-hidden pt-14 pb-10 px-4">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-0 left-1/3 w-[500px] h-[350px] rounded-full bg-yellow-600/6 blur-[100px]" />
          <div className="absolute top-0 right-1/3 w-[400px] h-[300px] rounded-full bg-amber-600/6 blur-[100px]" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <div className="flex justify-start mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/30 hover:text-white/60 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-yellow-300/70 mb-6">
            Students who cracked top open source programs
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Hall of{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400">
              Fame
            </span>
          </h1>
          <p className="text-white/40 text-lg max-w-lg mx-auto mb-10">
            Our students who got selected into prestigious open source programs.
          </p>

          {achievers.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3">
              {[
                { label: 'Achievers', value: achievers.length },
                { label: 'Selections', value: programCount },
                { label: 'Programs', value: programSet.size },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-8 py-4"
                >
                  <div className="text-3xl font-bold text-white tabular-nums">{stat.value}</div>
                  <div className="text-white/35 text-sm mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-24">
        {achievers.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-bold text-white mb-2">Coming Soon</h2>
            <p className="text-white/35 text-sm max-w-xs mx-auto">
              Our Hall of Fame is being built. NST students who crack GSoC, LFX, Outreachy and more will be celebrated here.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/programs" className="text-xs px-4 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400/70 hover:text-yellow-400 transition-all">
                Learn about programs →
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {achievers.map(({ entry, profile, student }, index) => (
              <AchieverCard key={entry.github} entry={entry} profile={profile} student={student} index={index} />
            ))}
          </div>
        )}
      </div>

      {/* Featured Student Maintainers */}
      <div className="max-w-6xl mx-auto px-4 pb-24 border-t border-white/[0.06] pt-16">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
          <div className="inline-block text-[10px] uppercase font-mono tracking-widest text-purple-400 border border-purple-500/20 bg-purple-500/5 px-2.5 py-1 rounded">
            Student-Led Open Source Projects
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Featured Student Maintainers</h2>
          <p className="text-white/40 text-sm">Celebrating students who build and maintain their own original open source codebases.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Card 1: Termstory */}
          <a
            href="https://github.com/bitflicker64/Termstory"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between p-6 rounded-2xl bg-white/[0.02] border border-white/[0.07] hover:bg-white/[0.04] hover:border-purple-500/30 hover:shadow-xl hover:shadow-purple-500/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">🐧</span>
                <div>
                  <h3 className="font-bold text-white text-base group-hover:text-white transition-colors">Termstory</h3>
                  <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">Memory Engine</span>
                </div>
              </div>
              <p className="text-white/60 text-xs leading-relaxed mb-4">
                Turns your terminal history into a searchable, AI-narrated timeline of your development life. Recover commands, correlate Git commits, and visualize your terminal work.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {['Python', 'TUI', 'Shell-History', 'CLI'].map((t) => (
                  <span key={t} className="text-[10px] px-2.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-white/[0.04] flex items-center justify-between text-xs text-white/40">
              <span className="flex items-center gap-2">
                <img
                  src="https://avatars.githubusercontent.com/u/211528427?v=4"
                  alt="bitflicker64"
                  className="w-5 h-5 rounded-full border border-white/10"
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
            className="group flex flex-col justify-between p-6 rounded-2xl bg-white/[0.02] border border-white/[0.07] hover:bg-white/[0.04] hover:border-blue-500/30 hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">📦</span>
                <div>
                  <h3 className="font-bold text-white text-base group-hover:text-white transition-colors">filedrop</h3>
                  <span className="text-[10px] text-white/30 font-mono uppercase tracking-wider">File Sharing</span>
                </div>
              </div>
              <p className="text-white/60 text-xs leading-relaxed mb-4">
                Instantly host encrypted files locally with QR codes for mobile transfer. Features AES-256-GCM browser encryption, ephemeral URLs, and DDoS protection.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {['JavaScript', 'Node.js', 'AES-256', 'Crypto'].map((t) => (
                  <span key={t} className="text-[10px] px-2.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-white/[0.04] flex items-center justify-between text-xs text-white/40">
              <span className="flex items-center gap-2">
                <img
                  src="https://avatars.githubusercontent.com/u/222502230?v=4"
                  alt="Dreamstick9"
                  className="w-5 h-5 rounded-full border border-white/10"
                />
                Built by <strong className="text-white/60">Dreamstick (@Dreamstick9)</strong>
              </span>
              <span className="text-blue-400 group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </a>
        </div>
      </div>
    </main>
  );
}
