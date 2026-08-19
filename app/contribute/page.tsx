import { getApprovedContributeItemsKV } from '@/lib/kv-contribute';
import { guidelines } from '@/lib/contribution-guidelines';
import { ContributeBoard } from './ContributeBoard';

export const metadata = {
  title: 'Contribute — Opensource Tracker NST',
  description: 'Open source ethics, code of conduct, and a curated board of issues and repositories worth contributing to.',
};

export const dynamic = 'force-dynamic';

export default async function ContributePage() {
  const items = await getApprovedContributeItemsKV();

  return (
    <main className="min-h-screen bg-[#030712] text-white relative">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 py-16 space-y-16">
        {/* Hero */}
        <section className="text-center space-y-4">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Before You Contribute
          </h1>
          <p className="text-white/45 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            Open source runs on trust. A handful of low-effort, AI-generated pull requests can bury a
            maintainer in review work for something that never should have been sent — read this first,
            then scroll down to find something worth working on.
          </p>
        </section>

        {/* Why open source */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white/85">Why Open Source</h2>
          <p className="text-white/45 text-sm leading-relaxed">
            Every tool you use daily — Linux, your browser, the frameworks powering the apps on your
            phone — exists because volunteers gave their time to build and maintain it, for free, in
            public. Contributing back isn&apos;t just a resume line: it&apos;s learning to read
            unfamiliar codebases, working with reviewers who owe you nothing, and shipping something a
            stranger will actually use. That&apos;s a different kind of practice than any course or
            hobby project gives you.
          </p>
        </section>

        {/* The maintainer-workload problem */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white/85">The Cost of Low-Effort PRs</h2>
          <p className="text-white/45 text-sm leading-relaxed">
            Maintainers are volunteers reviewing contributions on their own time. Since AI coding tools
            became widespread, many major projects have been flooded with PRs generated with little to no
            understanding of the codebase — plausible-looking diffs that don&apos;t actually work, or
            that &quot;fix&quot; something that was never broken. Every one of these costs a maintainer
            real time to read, test, and reject. Enough of them, and maintainers start ignoring new
            contributors entirely — closing the door for everyone after you. Every PR you open should be
            one you fully understand and can defend line by line.
          </p>
        </section>

        {/* Code of conduct */}
        <section className="space-y-6">
          <div className="border border-red-500/15 bg-red-500/[0.015] rounded-3xl p-6 md:p-8 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-red-400">Code of Conduct</h2>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 uppercase tracking-wide">
                Mandatory
              </span>
            </div>
            <div className="space-y-3">
              {guidelines.map((g, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 md:p-5 flex gap-4 ${
                    g.severity === 'critical'
                      ? 'border-red-500/30 bg-red-500/5'
                      : g.severity === 'high'
                      ? 'border-orange-500/25 bg-orange-500/5'
                      : 'border-emerald-500/25 bg-emerald-500/5'
                  }`}
                >
                  <span className="text-2xl flex-shrink-0">{g.icon}</span>
                  <div>
                    <div
                      className={`font-semibold text-sm ${
                        g.severity === 'critical'
                          ? 'text-red-400'
                          : g.severity === 'high'
                          ? 'text-orange-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {g.title}
                    </div>
                    <div className="text-white/50 text-xs leading-relaxed mt-1">{g.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Scroll cue */}
        <div className="flex flex-col items-center gap-2 text-white/25 text-xs">
          <span>Read all of that? Good. Here&apos;s where to find something worth working on.</span>
          <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>

        {/* Issue / Repo board */}
        <ContributeBoard initialItems={items} />
      </div>
    </main>
  );
}
