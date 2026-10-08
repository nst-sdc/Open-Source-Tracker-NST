import Link from 'next/link';
import { getAchieversKV } from '@/lib/kv-achievers';
import {
  CycleCountdownCompact,
  NextCycleHighlight,
  ProgramCycleCountdown,
} from '../components/CycleCountdown';

export const metadata = { title: 'Open Source Programs — Opensource Tracker NST' };
export const revalidate = 3600;

const HOF_NAMES: Record<string, string[]> = { 'summer-of-bitcoin': ['Summer of Bitcoin', 'SoB'], lfdt: ['LFDT', 'Hyperledger'] };

const PROGRAMS = [
  {
    id: 'gsoc',
    name: 'Google Summer of Code',
    short: 'GSoC',
    color: 'text-brand-600',
    accent: 'border-brand-100',
    bg: 'bg-brand-500/5',
    dot: 'bg-brand-400',
    dotBorder: 'border-brand-100',
    stipend: '$1,500 – $6,600 (by project size and country)',
    duration: '12 weeks standard, up to 22 (late May – August)',
    eligibility: '18+, new or beginner open source contributors. Students and non-students.',
    deadline: 'Contributor applications 16 – 31 March; organizations announced ~19 February',
    org: 'Google',
    link: 'https://summerofcode.withgoogle.com',
    desc: 'The most prestigious open source internship program in the world, run by Google since 2005. Students work with a mentoring open source organization on a 12-week coding project and receive a stipend. Thousands of organizations participate each year — including Python, Linux Kernel, Mozilla, NumPy, KDE, and hundreds more.',
    tips: [
      'Start contributing to your target org 3–6 months before applications open',
      'Write a strong proposal — the project plan is the single most important factor',
      'Get at least 2–3 PRs merged in the org before submitting',
      'Talk to potential mentors on the org\'s communication channels',
      'Read accepted proposals from previous years (many orgs publish them)',
    ],
  },
  {
    id: 'lfx',
    name: 'LFX Mentorship',
    short: 'LFX',
    color: 'text-violet-600',
    accent: 'border-violet-500/30',
    bg: 'bg-violet-500/5',
    dot: 'bg-violet-500',
    dotBorder: 'border-violet-500/40',
    stipend: '$3,000 – $6,600 (by region)',
    duration: '12 weeks; three terms (Mar – May, Jun – Aug, Sep – Nov)',
    eligibility: '18+ and eligible to work in your country',
    deadline: 'Two-week windows: 26 Jan – 10 Feb, 5 – 19 May, 3 – 18 Aug (2026)',
    org: 'Linux Foundation',
    link: 'https://mentorship.lfx.linuxfoundation.org',
    desc: 'The Linux Foundation\'s mentorship platform. CNCF, Kubernetes, the Linux kernel, LF Decentralized Trust and most other LF projects run their mentorships through it, so one portal covers them all. Great for infrastructure, DevOps and cloud-native work.',
    tips: [
      'Browse projects on the LFX portal and filter by technology or interest',
      'Make early contributions to shortlisted projects — competition is high',
      'Write a detailed application explaining your background and plan',
      'CNCF and Kubernetes projects are very popular — start early',
      'Each term has different projects, so check back each cycle',
    ],
  },
  {
    id: 'outreachy',
    name: 'Outreachy',
    short: 'Outreachy',
    color: 'text-success-600',
    accent: 'border-success-100',
    bg: 'bg-success-0',
    dot: 'bg-success-400',
    dotBorder: 'border-success-200',
    stipend: '$7,000',
    duration: '3 months (May – August or December – March)',
    eligibility: 'People underrepresented in tech. Specific eligibility criteria applies — check the site.',
    deadline: 'One-week windows: 6 – 13 Feb for the May cohort, 24 – 31 Aug for the December cohort (2026)',
    org: 'Software Freedom Conservancy',
    link: 'https://www.outreachy.org',
    desc: 'Outreachy provides paid internships in open source and open science to people subject to systemic bias and underrepresentation in tech. It has one of the highest stipends of any open source program ($7,000). Organizations include Wikimedia, GNOME, Linux Kernel, Mozilla, Python, and many more.',
    tips: [
      'Check eligibility criteria carefully before applying — it is specific',
      'The contribution period (before final application) is critical — contribute actively',
      'Communicate regularly with mentors during the contribution phase',
      'Your final application quality directly reflects your contributions',
      'Reach out to past Outreachy interns for guidance',
    ],
  },
  {
    id: 'summer-of-bitcoin',
    name: 'Summer of Bitcoin',
    short: 'SoB',
    color: 'text-warning-600',
    accent: 'border-warning-200',
    bg: 'bg-warning-0',
    dot: 'bg-warning-400',
    dotBorder: 'border-warning-200',
    stipend: 'Up to $6,600, paid in bitcoin (by location)',
    duration: '12 weeks (June – August)',
    eligibility: 'University students',
    deadline: 'Opens in January, closes mid February (2026: 15 Feb); selection bootcamp runs Feb – Mar',
    org: 'Summer of Bitcoin Foundation',
    link: 'https://www.summerofbitcoin.org',
    desc: 'A global, online summer internship program focused on introducing university students to Bitcoin open source development and Bitcoin design. Students work with Bitcoin and Lightning Network projects and receive both a cash stipend and Bitcoin. This is one of the few programs specifically focused on the Bitcoin/Lightning ecosystem.',
    tips: [
      'Learn Bitcoin fundamentals and Lightning Network basics before applying',
      'Contribute to Bitcoin FOSS projects on GitHub ahead of the application period',
      'Having prior knowledge of cryptography or distributed systems helps',
      'Projects include Bitcoin Core, Lightning, Rust Bitcoin, and related tooling',
      'The program is highly selective — quality of contributions matters a lot',
    ],
  },
  {
    id: 'hacktoberfest',
    name: 'Hacktoberfest',
    short: 'Hacktoberfest',
    color: 'text-violet-600',
    accent: 'border-violet-100',
    bg: 'bg-violet-0',
    dot: 'bg-violet-500',
    dotBorder: 'border-violet-200',
    stipend: 'Digital rewards (no cash stipend)',
    duration: 'October (1 month)',
    eligibility: 'Anyone globally',
    deadline: 'Every October — register in late September or during the month',
    org: 'DigitalOcean + GitHub',
    link: 'https://hacktoberfest.com',
    desc: 'Hacktoberfest is the annual October open source event. In 2026 it is built around 300+ in-person and online "fests" focused on open source AI, rather than the four-pull-request badge of earlier years. Still the easiest first step into contributing.',
    tips: [
      'Perfect for making your first open source contribution',
      'Look for repos tagged with "hacktoberfest" on GitHub',
      'Quality over quantity — spammy PRs will be marked as invalid',
      'Use it as practice for larger programs like GSoC',
      'Many orgs run workshops and events during October — attend them',
    ],
  },
  {
    id: 'sok',
    name: 'Season of KDE',
    short: 'SoK',
    color: 'text-brand-600',
    accent: 'border-brand-100',
    bg: 'bg-brand-0',
    dot: 'bg-brand-400',
    dotBorder: 'border-brand-200',
    stipend: 'Certificate & swag (no cash stipend)',
    duration: 'About 8 weeks (late January – March)',
    eligibility: 'Open to anyone globally, great for beginners',
    deadline: 'Applications December to mid January (2026 deadline: 14 Jan)',
    org: 'KDE Community',
    link: 'https://season.kde.org',
    desc: 'Season of KDE is a community outreach program hosted by the KDE team. Similar to GSoC, students are mentored by experienced KDE developers to work on applications, user interface, translation, or documentation projects. Although unpaid, it is highly valued for gaining core desktop development experience.',
    tips: [
      'Join KDE Matrix channels and introduce yourself to project teams',
      'Build and run your target KDE application locally before applying',
      'Submit small patch contributions to get a feel of their workflow',
      'Write a comprehensive proposal using the KDE template',
      'Interact actively on developer forums and mailing lists',
    ],
  },
  {
    id: 'lfdt',
    name: 'LF Decentralized Trust Mentorship',
    short: 'LFDT',
    color: 'text-brand-600',
    accent: 'border-brand-100',
    bg: 'bg-brand-0',
    dot: 'bg-brand-400',
    dotBorder: 'border-brand-200',
    stipend: 'Tiered by country of residence',
    duration: 'June – November, about 15 hours a week',
    eligibility: 'Anyone, at any career stage',
    deadline: 'Mentee applications 31 March – 11 May (2026)',
    org: 'LF Decentralized Trust / Linux Foundation',
    link: 'https://www.lfdecentralizedtrust.org/mentorship',
    desc: 'The former Hyperledger Mentorship Program, now run by LF Decentralized Trust: Besu, Fabric, Indy and the other ledger projects. Longer and part-time, so it fits alongside a semester, and applications go through LFX.',
    tips: [
      'Learn standard blockchain architectures and cryptography principles',
      'Study Golang, Node.js, and Java which are major Hyperledger tools',
      'Familiarize yourself with Docker and container orchestration',
      'Submit proposals directly tackling performance or consensus bugs',
      'Reach out to project leads on the Hyperledger chat portal',
    ],
  },
  {
    id: 'gssoc',
    name: 'GirlScript Summer of Code',
    short: 'GSSoC',
    color: 'text-error-600',
    accent: 'border-error-100',
    bg: 'bg-error-500/5',
    dot: 'bg-error-400',
    dotBorder: 'border-error-100',
    stipend: 'Prizes & Goodies (no cash stipend)',
    duration: '3 months (15 May – 15 August in 2026)',
    eligibility: 'Open to everyone worldwide, very beginner-friendly',
    deadline: 'Applications early in the year (2026: opened 20 Jan, selections in April)',
    org: 'GirlScript Foundation',
    link: 'https://gssoc.tech',
    desc: 'GirlScript Summer of Code is a 3-month long open-source program during summers conducted by the GirlScript Foundation. Started in 2018, it aims to help beginners get started with open-source development while encouraging diversity. Participants work under the guidance of experienced mentors on diverse web, app, and system projects.',
    tips: [
      'Excellent program for making your very first contributions',
      'Select active repositories from the official project list',
      'Solve smaller "good first issues" to build confidence',
      'Engage with project mentors on their Discord channels',
      'Consistency is key — score points on the leaderboard throughout the program',
    ],
  },
  {
    id: 'ospp',
    name: 'Open Source Promotion Plan',
    short: 'OSPP',
    color: 'text-violet-600',
    accent: 'border-violet-100',
    bg: 'bg-violet-0',
    dot: 'bg-violet-500',
    dotBorder: 'border-violet-100',
    stipend: '¥8,000 – ¥12,000 (about $1,100 – $1,700)',
    duration: '3 months (1 July – 30 September)',
    eligibility: 'Students globally, 18+',
    deadline: 'Registration 29 April – 4 June; project applications until 16 June (2026)',
    org: 'ISCAS (Chinese Academy of Sciences)',
    link: 'https://summer-ospp.ac.cn',
    desc: 'Open Source Promotion Plan (OSPP) is an international summer program designed to encourage students to participate in open source software development. Students work with open-source communities worldwide under the guidance of experienced mentors on coding, optimization, or porting projects.',
    tips: [
      'Familiarize yourself with backend systems, compilers, and operating systems',
      'Understand target project specifications before drafting proposals',
      'Communicate with mentors on their Slack or GitHub issues early',
      'Write highly technical proposals addressing the project requirements',
      'Keep track of progress deliverables throughout the 3-month cycle',
    ],
  },
  {
    id: 'codeheat',
    name: 'FOSSASIA Codeheat',
    short: 'Codeheat',
    color: 'text-error-600',
    accent: 'border-error-100',
    bg: 'bg-error-0',
    dot: 'bg-error-400',
    dotBorder: 'border-error-100',
    stipend: 'Summit Travel Funding & Goodies',
    duration: '6 months (September – February)',
    eligibility: 'Open to anyone worldwide',
    deadline: 'Join at any point during the contest (September – February)',
    org: 'FOSSASIA',
    link: 'https://codeheat.org',
    desc: 'FOSSASIA Codeheat is a coding contest terms program where developers contribute to projects like EventYeti, Open Event, Badge Magic, and Phimpme. Mentors guide participants to make pull requests. The top participants receive travel funding to speak at the annual FOSSASIA Summit.',
    tips: [
      'Contribute regularly to build a track record on FOSSASIA repositories',
      'Help other newcomers and actively participate in the community channels',
      'Write blog posts detailing your project contributions to gain visibility',
      'Select issues related to your core coding skills (Web, Python, Android)',
      'Deliver clean code matching the style guides of FOSSASIA',
    ],
  },
];

const CONFERENCES = [
  { name: 'FOSDEM', where: 'Brussels', when: 'Late January', edition: '30 – 31 Jan 2027', support: 'Free, no registration', link: 'https://fosdem.org' },
  { name: 'DevConf.IN', where: 'Pune', when: 'February', edition: '13 – 14 Feb 2026', support: 'Free', link: 'https://www.devconf.info/in/' },
  { name: 'SCaLE', where: 'Pasadena', when: 'March', edition: '5 – 8 Mar 2026', support: '', link: 'https://www.socallinuxexpo.org' },
  { name: 'FOSSASIA Summit', where: 'Bangkok, hybrid', when: 'March', edition: '8 – 10 Mar 2026', support: '', link: 'https://summit.fossasia.org' },
  { name: 'Open Source Summit India', where: 'Mumbai', when: 'June', edition: '16 – 17 Jun 2026', support: '', link: 'https://events.linuxfoundation.org/open-source-summit-india/' },
  { name: 'KubeCon + CloudNativeCon India', where: 'Mumbai', when: 'June', edition: '18 – 19 Jun 2026', support: 'Dan Kohn scholarship covers ticket and travel; apply by early April', link: 'https://events.linuxfoundation.org/kubecon-cloudnativecon-india/' },
  { name: 'openSUSE Conference', where: 'Nuremberg', when: 'June', edition: '25 – 27 Jun 2026', support: 'Travel Support Program', link: 'https://events.opensuse.org' },
  { name: 'GUADEC', where: 'A Coruña in 2026', when: 'July', edition: '16 – 21 Jul 2026', support: 'Travel sponsorship; request by mid March', link: 'https://events.gnome.org' },
  { name: 'Akademy', where: 'Graz in 2026', when: 'September', edition: '18 – 24 Sep 2026', support: 'KDE e.V. travel reimbursement', link: 'https://akademy.kde.org' },
  { name: 'IndiaFOSS', where: 'Bengaluru', when: 'September', edition: '26 – 27 Sep 2026', support: 'Free to attend', link: 'https://indiafoss.net' },
  { name: 'PyCon India', where: 'Bengaluru in 2025', when: 'September', edition: '2026 dates not announced', support: 'Need-based travel and stay grant', link: 'https://in.pycon.org' },
  { name: 'All Things Open', where: 'Raleigh', when: 'October', edition: '19 – 20 Oct 2026', support: '', link: 'https://www.allthingsopen.org' },
];

export default async function ProgramsPage() {
  const achievers = await getAchieversKV();
  const trackRecord = (p: { id: string; short: string; name: string }) => {
    const names = (HOF_NAMES[p.id] ?? [p.short, p.name]).map((n) => n.toLowerCase());
    const hits = achievers.flatMap((a) => (a.programs ?? []).filter((x) => names.includes(x.name.toLowerCase())));
    if (hits.length === 0) return 'No NST selection in the Hall of Fame yet.';
    const orgs = [...new Set(hits.map((x) => x.org?.trim()).filter((o): o is string => !!o))];
    return `${hits.length} NST ${hits.length === 1 ? 'selection' : 'selections'}${orgs.length ? ' — ' + orgs.join(' · ') : ''}.`;
  };

  return (
    <main className="min-h-screen bg-panel">
      {/* Hero */}
      <div className="relative overflow-hidden pt-14 pb-10 px-4">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute top-0 left-1/4 w-[500px] h-[350px] rounded-full bg-brand-100/40 blur-[100px]" />
          <div className="absolute top-0 right-1/4 w-[400px] h-[300px] rounded-full bg-violet-600/7 blur-[100px]" />
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

          <div className="inline-flex items-center gap-2 bg-panel border border-line rounded-full px-4 py-1.5 text-xs text-brand-600/70 mb-6">
            Paid internships · Global programs · Real-world impact
          </div>
          <h1 className="text-5xl md:text-6xl font-[650] text-ink mb-4 tracking-tight">
            Open Source{' '}
            <span className="text-violet-600">
              Programs
            </span>
          </h1>
          <p className="text-ink-soft text-lg max-w-2xl mx-auto leading-relaxed mb-6">
            A guide to the world&apos;s best paid open source programs — stipends, timelines,
            eligibility, and how NST students have fared.
          </p>

          {/* Whichever cycle is open now, or opens soonest */}
          <div className="flex justify-center mb-8">
            <NextCycleHighlight
              programs={PROGRAMS.map((p) => ({ id: p.id, short: p.short }))}
            />
          </div>

          {/* Quick jump */}
          <div className="flex flex-wrap gap-2 justify-center">
            {PROGRAMS.map((p) => (
              <a
                key={p.id}
                href={`#${p.id}`}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${p.bg} ${p.accent} ${p.color} hover:opacity-80`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${p.dot} mr-1.5 align-middle`} />
                {p.short}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pb-24 space-y-12">

        {/* Quick comparison cards */}
        <section>
          <h2 className="text-ink-soft text-xs font-[500] uppercase tracking-widest mb-4">
            Quick Comparison
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROGRAMS.map((p) => (
              <div key={p.id} className={`rounded-xl border ${p.accent} ${p.bg} p-4`}>
                <div className={`font-[650] text-sm mb-2 ${p.color}`}>{p.short}</div>
                {/* Label left, value right. The label never shrinks and the gap
                    always holds, so a value long enough to wrap can't run back
                    into it — these cards get narrow at the 3-column breakpoint. */}
                <div className="space-y-1 text-xs text-ink-soft">
                  <div className="flex justify-between gap-3"><span className="text-ink-soft shrink-0">Stipend</span><span className="text-right">{p.stipend}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-ink-soft shrink-0">Duration</span><span className="text-right">{p.duration.split('(')[0].trim()}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-ink-soft shrink-0">Deadline</span><span className="text-right">{p.deadline.split('—')[0].trim()}</span></div>
                  <CycleCountdownCompact programId={p.id} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Program detail sections */}
        {PROGRAMS.map((p) => (
          <section key={p.id} id={p.id}>
            <div className={`rounded-2xl border ${p.accent} ${p.bg} overflow-hidden`}>
              {/* Header */}
              <div className="p-6 border-b border-line">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                      <span className={`text-xs font-[500] ${p.color} opacity-70`}>{p.org}</span>
                    </div>
                    <h2 className={`text-2xl font-[650] ${p.color}`}>{p.name}</h2>
                  </div>
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${p.accent} ${p.color} hover:opacity-80 transition-opacity`}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Official site
                  </a>
                </div>

                <p className="text-ink-mid text-sm mt-4 leading-relaxed">{p.desc}</p>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-ground">
                {[
                  { label: 'Stipend', value: p.stipend },
                  { label: 'Duration', value: p.duration },
                  { label: 'Eligibility', value: p.eligibility },
                  { label: 'Apply By', value: p.deadline },
                ].map((item) => (
                  <div key={item.label} className={`${p.bg} px-4 py-3`}>
                    <div className="text-ink-soft text-xs mb-1">{item.label}</div>
                    <div className="text-ink-mid text-xs font-[500] leading-snug">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Countdown to the next application cycle */}
              <ProgramCycleCountdown programId={p.id} />

              {/* Tips */}
              <div className="p-6 border-t border-line">
                <div className={`text-xs font-[550] ${p.color} uppercase tracking-wide mb-3`}>
                  Tips to get selected
                </div>
                <ul className="space-y-2">
                  {p.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-ink-soft text-sm">
                      <span className={`${p.color} opacity-50 flex-shrink-0 mt-0.5`}>✓</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>

              {/* NST track record */}
              <div className={`px-6 py-4 border-t border-line bg-ground`}>
                <span className={`text-xs font-[550] ${p.color}`}>NST track record — </span>
                <span className="text-ink-soft text-xs">{trackRecord(p)}</span>
              </div>
            </div>
          </section>
        ))}

        {/* Conferences */}
        <section id="conferences">
          <h2 className="text-ink-soft text-xs font-[500] uppercase tracking-widest mb-2">
            Conferences
          </h2>
          <p className="text-ink-soft text-sm mb-4">
            Most of these fund students to attend or have no ticket at all. Students who spoke at one are listed in the{' '}
            <Link href="/achievers" className="underline underline-offset-2 hover:text-ink">Hall of Fame</Link>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CONFERENCES.map((c) => (
              <a
                key={c.name}
                href={c.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-line bg-ground p-4 hover:border-brand-400 transition-colors"
              >
                <div className="font-[650] text-sm text-ink">{c.name}</div>
                <div className="text-xs text-ink-soft mt-1">{c.where} · {c.when}</div>
                <div className="text-xs text-ink-mid mt-1">{c.edition}</div>
                {c.support && <div className="text-xs text-ink-soft mt-2">{c.support}</div>}
              </a>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-line bg-ground p-8 text-center">
          <h2 className="text-xl font-[650] text-ink mb-2">Ready to start your journey?</h2>
          <p className="text-ink-soft text-sm mb-6">
            See who is contributing and learn how to get started.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/contributors"
              className="px-5 py-2.5 rounded-xl bg-panel border border-line text-ink text-sm font-[500] hover:bg-panel-2 transition-all"
            >
              View Contributors
            </Link>
            <Link
              href="/achievers"
              className="px-5 py-2.5 rounded-xl bg-gold-0 border border-gold-100 text-gold-600 text-sm font-[500] hover:bg-gold-0 transition-all"
            >
              Hall of Fame
            </Link>
            <Link
              href="/get-started"
              className="px-5 py-2.5 rounded-xl bg-success-0 border border-success-100 text-success-600 text-sm font-[500] hover:bg-success-100 transition-all"
            >
              Get Started Guide
            </Link>
          </div>
          <p className="text-ink-soft text-xs mt-6">
            Stipends and deadlines shown are approximate — always verify on the official program site before applying.
          </p>
        </section>
      </div>
    </main>
  );
}
