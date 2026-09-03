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
    'bg-violet-500',
    'bg-brand-500',
    'bg-success-500',
    'bg-warning-400',
    'bg-error-400',
    'bg-violet-500',
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0 ring-2 ring-line`}
    >
      <span className="text-ink font-[650]" style={{ fontSize: size * 0.35 }}>
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
    <div className="group relative bg-ground border border-line rounded-2xl p-6 hover:bg-panel hover:border-gold-100 transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1 h-full">
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
            className="w-14 h-14 rounded-full ring-2 ring-line group-hover:ring-gold-100 transition-all object-cover flex-shrink-0"
          />
        ) : (
          <div className="group-hover:[--ring-color:rgba(234,179,8,0.3)] transition-all">
            <InitialsAvatar name={displayName} size={56} />
          </div>
        )}

        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className="font-[550] text-ink group-hover:text-ink truncate transition-colors">
            {displayName}
          </h3>
          <p className="text-ink-soft text-xs mt-0.5">@{handle}</p>
          {(student?.year || student?.campus) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {student.year && (
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-violet-0 text-violet-600 border border-violet-100 font-[500]">
                  {student.year}
                </span>
              )}
              {student.campus && (
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-brand-0 text-brand-600 border border-brand-100 font-[500]">
                  {student.campus}
                </span>
              )}
            </div>
          )}
          {bio && (
            <p className="text-ink-soft text-xs mt-1.5 line-clamp-2 leading-relaxed">{bio}</p>
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

      <div className="mt-4 flex items-center justify-between">
        <span className="text-ink-soft text-xs group-hover:text-ink-soft transition-colors">
          View achievements
        </span>
        <svg
          className="w-4 h-4 text-ink-faint group-hover:text-gold-600 group-hover:translate-x-0.5 transition-all"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );

  return profile ? (
    <Link href={`/achievers/${entry.github}`} className="block h-full">
      {inner}
    </Link>
  ) : (
    <div className="h-full">{inner}</div>
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
    <main className="min-h-screen bg-panel">
      <div className="relative overflow-hidden pt-14 pb-10 px-4">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-0 left-1/3 w-[500px] h-[350px] rounded-full bg-gold-100/40 blur-[100px]" />
          <div className="absolute top-0 right-1/3 w-[400px] h-[300px] rounded-full bg-gold-100/40 blur-[100px]" />
        </div>

        <div className="relative max-w-6xl mx-auto text-center">
          <div className="flex justify-start mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-ink-soft hover:text-ink-mid transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 bg-panel border border-line rounded-full px-4 py-1.5 text-xs text-gold-600/70 mb-6">
            Students who cracked top open source programs
          </div>
          <h1 className="text-5xl md:text-6xl font-[650] text-ink mb-4 tracking-tight">
            Hall of{' '}
            <span className="text-gold-600">
              Fame
            </span>
          </h1>
          <p className="text-ink-soft text-lg max-w-lg mx-auto mb-10">
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
                  className="bg-ground border border-line rounded-2xl px-8 py-4"
                >
                  <div className="text-3xl font-[650] text-ink tabular-nums">{stat.value}</div>
                  <div className="text-ink-soft text-sm mt-0.5">{stat.label}</div>
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
            <h2 className="text-2xl font-[650] text-ink mb-2">Coming Soon</h2>
            <p className="text-ink-soft text-sm max-w-xs mx-auto">
              Our Hall of Fame is being built. NST students who crack GSoC, LFX, Outreachy and more will be celebrated here.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/programs" className="text-xs px-4 py-2 rounded-xl bg-gold-0 border border-gold-100 text-gold-600/70 hover:text-gold-600 transition-all">
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
      <div className="max-w-6xl mx-auto px-4 pb-24 border-t border-line pt-16">
        <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
          <div className="inline-block text-[10px] uppercase font-mono tracking-widest text-violet-600 border border-violet-100 bg-violet-0 px-2.5 py-1 rounded">
            Student-Led Open Source Projects
          </div>
          <h2 className="text-3xl md:text-4xl font-[650] text-ink tracking-tight">Featured Student Maintainers</h2>
          <p className="text-ink-soft text-sm">Celebrating students who build and maintain their own original open source codebases.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Card 1: Termstory */}
          <a
            href="https://github.com/bitflicker64/Termstory"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between p-6 rounded-2xl bg-ground border border-line hover:bg-panel hover:border-violet-100 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">🐧</span>
                <div>
                  <h3 className="font-[650] text-ink text-base group-hover:text-ink transition-colors">Termstory</h3>
                  <span className="text-[10px] text-ink-soft font-mono uppercase tracking-wider">Memory Engine</span>
                </div>
              </div>
              <p className="text-ink-mid text-xs leading-relaxed mb-4">
                Turns your terminal history into a searchable, AI-narrated timeline of your development life. Recover commands, correlate Git commits, and visualize your terminal work.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {['Python', 'TUI', 'Shell-History', 'CLI'].map((t) => (
                  <span key={t} className="text-[10px] px-2.5 py-0.5 rounded bg-panel border border-line text-ink-soft font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-line flex items-center justify-between text-xs text-ink-soft">
              <span className="flex items-center gap-2">
                <img
                  src="https://avatars.githubusercontent.com/u/211528427?v=4"
                  alt="bitflicker64"
                  className="w-5 h-5 rounded-full border border-line"
                />
                Built by <strong className="text-ink-mid">KAI (@bitflicker64)</strong>
              </span>
              <span className="text-violet-600 group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </a>

          {/* Card 2: Filedrop */}
          <a
            href="https://github.com/Dreamstick9/filedrop"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between p-6 rounded-2xl bg-ground border border-line hover:bg-panel hover:border-brand-100 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.25)]">📦</span>
                <div>
                  <h3 className="font-[650] text-ink text-base group-hover:text-ink transition-colors">filedrop</h3>
                  <span className="text-[10px] text-ink-soft font-mono uppercase tracking-wider">File Sharing</span>
                </div>
              </div>
              <p className="text-ink-mid text-xs leading-relaxed mb-4">
                Instantly host encrypted files locally with QR codes for mobile transfer. Features AES-256-GCM browser encryption, ephemeral URLs, and DDoS protection.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {['JavaScript', 'Node.js', 'AES-256', 'Crypto'].map((t) => (
                  <span key={t} className="text-[10px] px-2.5 py-0.5 rounded bg-panel border border-line text-ink-soft font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="pt-4 border-t border-line flex items-center justify-between text-xs text-ink-soft">
              <span className="flex items-center gap-2">
                <img
                  src="https://avatars.githubusercontent.com/u/222502230?v=4"
                  alt="Dreamstick9"
                  className="w-5 h-5 rounded-full border border-line"
                />
                Built by <strong className="text-ink-mid">Dreamstick (@Dreamstick9)</strong>
              </span>
              <span className="text-brand-600 group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </a>
        </div>
      </div>
    </main>
  );
}
