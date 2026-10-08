import Link from 'next/link';
import { NextCycleHighlight, ProgramCycleCountdown } from '../components/CycleCountdown';
import { getAchieversKV } from '@/lib/kv-achievers';

export const metadata = { title: 'Open Source Programs — Opensource Tracker NST' };
export const revalidate = 3600;

interface ProgramDef {
  id: string;
  name: string;
  short: string;
  org: string;
  link: string;
  /** Program names as the Hall of Fame records them, when they differ from `short`. */
  hof?: string[];
  applications: string;
  runs: string;
  stipend: string;
  eligibility: string;
  desc: string;
  tips: string[];
}

// Dates are from each program's 2026 timeline. Verify on the official site before relying on one.
const PROGRAMS: ProgramDef[] = [
  {
    id: 'gsoc',
    name: 'Google Summer of Code',
    short: 'GSoC',
    org: 'Google',
    link: 'https://summerofcode.withgoogle.com',
    applications: '16 – 31 March. Organisations are announced ~19 February.',
    runs: 'Late May – August; 12 weeks standard, extendable to 22.',
    stipend: '$1,500 – $6,600, by project size and country',
    eligibility: '18+, new or beginner open source contributors. Students and non-students.',
    desc: 'A paid programming project with a mentoring open source organisation, run by Google since 2005. 185 organisations took part in 2026.',
    tips: [
      'Start contributing to your target org before the org list is even announced — selection is largely on merged PRs.',
      'The proposal is the deciding document. Read accepted proposals from earlier years; many orgs publish them.',
      'Talk to the mentors on the org\'s channels before you submit.',
    ],
  },
  {
    id: 'lfx',
    name: 'LFX Mentorship',
    short: 'LFX',
    org: 'Linux Foundation',
    link: 'https://mentorship.lfx.linuxfoundation.org',
    applications: 'Three two-week windows a year. 2026: 26 Jan – 10 Feb, 5 – 19 May, 3 – 18 Aug.',
    runs: 'Mar – May, Jun – Aug, Sep – Nov; 12 weeks each.',
    stipend: '$3,000 – $6,600, by region',
    eligibility: '18+ and eligible to work in your country.',
    desc: 'The Linux Foundation\'s mentorship platform. CNCF, Kubernetes, the Linux kernel, Hyperledger and most other LF projects run their mentorships through it, so one application portal covers them all.',
    tips: [
      'Projects are listed per term — check the portal each cycle, not once.',
      'CNCF projects publish their ideas in github.com/cncf/mentoring ahead of the portal opening.',
      'A merged PR in the project before you apply is the strongest signal you can send.',
    ],
  },
  {
    id: 'outreachy',
    name: 'Outreachy',
    short: 'Outreachy',
    org: 'Software Freedom Conservancy',
    link: 'https://www.outreachy.org',
    applications: 'One week, twice a year. 2026: 6 – 13 Feb (May cohort), 24 – 31 Aug (December cohort).',
    runs: 'May – August and December – March; 3 months.',
    stipend: '$7,000',
    eligibility: 'People facing under-representation or systemic bias in tech. Read the eligibility rules carefully.',
    desc: 'Paid remote internships in open source and open science. The initial application window is short and strict; a contribution period with the project follows for those who pass it.',
    tips: [
      'The initial application closes in a week — have your essays ready before it opens.',
      'Contributions during the contribution period are what you are selected on.',
      'Keep talking to mentors; they rank applicants they know.',
    ],
  },
  {
    id: 'summer-of-bitcoin',
    name: 'Summer of Bitcoin',
    short: 'SoB',
    hof: ['Summer of Bitcoin', 'SoB'],
    org: 'Summer of Bitcoin',
    link: 'https://www.summerofbitcoin.org',
    applications: 'Opens in January, deadline mid February (2026: 15 Feb). A bootcamp follows until late March, then proposals by mid April.',
    runs: 'June – August; 12 weeks.',
    stipend: 'Up to $6,600, paid in bitcoin, by location',
    eligibility: 'University students.',
    desc: 'A summer programme on Bitcoin and Lightning open source projects, with a selection bootcamp before the project phase.',
    tips: [
      'The bootcamp is the real filter — budget time for it in February and March.',
      'Know Bitcoin Core and Lightning basics before applying; the bootcamp assumes them.',
      'Prior work in Rust, C++ or Go is the usual background of selected students.',
    ],
  },
  {
    id: 'lfdt',
    name: 'LF Decentralized Trust Mentorship',
    short: 'LFDT',
    hof: ['LFDT', 'Hyperledger'],
    org: 'Linux Foundation',
    link: 'https://www.lfdecentralizedtrust.org/mentorship',
    applications: '31 March – 11 May (2026).',
    runs: 'June – November, about 15 hours a week.',
    stipend: 'Tiered by country of residence',
    eligibility: 'Anyone, at any career stage.',
    desc: 'The former Hyperledger mentorship, now under LF Decentralized Trust: Besu, Fabric, Indy and the other ledger projects. Longer and part-time, so it fits alongside a semester.',
    tips: [
      'Project ideas are on GitHub before the portal opens; pick two and go deep rather than applying to three.',
      'Applications go through LFX — the same account as LFX Mentorship.',
      'Go and Java are the main languages across the projects.',
    ],
  },
  {
    id: 'ospp',
    name: 'Open Source Promotion Plan',
    short: 'OSPP',
    org: 'ISCAS, Chinese Academy of Sciences',
    link: 'https://summer-ospp.ac.cn',
    applications: 'Registration 29 April – 4 June; project applications until 16 June (2026).',
    runs: '1 July – 30 September.',
    stipend: '¥8,000 – ¥12,000 (about $1,100 – $1,700), by project level',
    eligibility: 'Enrolled university students, 18+, worldwide.',
    desc: 'A GSoC-style summer programme from China that is open internationally, with hundreds of communities including KDE, Apache projects and the OpenHarmony ecosystem.',
    tips: [
      'The site and most project pages are in English; mentor communication often is not — ask early.',
      'Project applications are per project with a deadline a fortnight after registration closes.',
      'Results come in November, well after the coding period.',
    ],
  },
  {
    id: 'gssoc',
    name: 'GirlScript Summer of Code',
    short: 'GSSoC',
    org: 'GirlScript Foundation',
    link: 'https://gssoc.girlscript.org',
    applications: 'Early in the year; 2026 applications opened 20 January, with selections in April.',
    runs: '15 May – 15 August (2026).',
    stipend: 'None — certificates, swag and a leaderboard',
    eligibility: 'Anyone. Beginner-friendly.',
    desc: 'A large, free, beginner-oriented contribution programme. Good for a first merged PR and for learning the workflow; it carries little weight with the paid programmes above.',
    tips: [
      'Pick two or three active repositories and stay with them rather than chasing points everywhere.',
      'Quality of PRs is what you can show afterwards; the leaderboard is not.',
      'Use it as the warm-up for a GSoC or LFX application the following year.',
    ],
  },
  {
    id: 'sok',
    name: 'Season of KDE',
    short: 'SoK',
    org: 'KDE',
    link: 'https://mentorship.kde.org/sok/',
    applications: 'December to mid January (2026 deadline: 14 January).',
    runs: 'Late January – March (2026: 23 Jan – 20 Mar).',
    stipend: 'None — certificate and swag',
    eligibility: 'Anyone. Beginner-friendly.',
    desc: 'KDE\'s own mentored programme, running over the winter. Unpaid, but a direct route into one of the largest desktop codebases and a known stepping stone to KDE\'s GSoC slots.',
    tips: [
      'Build the application you want to work on from source before you apply.',
      'Introduce yourself on KDE Matrix and land a small patch first.',
      'Propose using the KDE template; reviewers expect it.',
    ],
  },
  {
    id: 'codeheat',
    name: 'FOSSASIA Codeheat',
    short: 'Codeheat',
    org: 'FOSSASIA',
    link: 'https://codeheat.org',
    applications: 'Join at any point during the contest.',
    runs: 'September – February, every year.',
    stipend: 'Travel grant to the FOSSASIA Summit for the winners',
    eligibility: 'Anyone.',
    desc: 'FOSSASIA\'s contribution contest across its projects (Open Event, Badge Magic, Phimpme and others). The prize for the top contributors is a funded trip to speak at the FOSSASIA Summit in March.',
    tips: [
      'Consistent contributions across the whole period score better than a burst.',
      'Blog posts about your work count and get you noticed by the organisers.',
      'Web and Android are where most of the issues are.',
    ],
  },
  {
    id: 'hacktoberfest',
    name: 'Hacktoberfest',
    short: 'Hacktoberfest',
    org: 'DigitalOcean',
    link: 'https://hacktoberfest.com',
    applications: 'Register in late September or during October.',
    runs: 'October.',
    stipend: 'None — digital rewards',
    eligibility: 'Anyone.',
    desc: 'The annual October open source event. In 2026 it is built around 300+ in-person and online "fests" focused on open source AI, rather than the four-PR badge of earlier years.',
    tips: [
      'Look for a fest near you — the 2026 format is event-based.',
      'Spam PRs get marked invalid and reflect on your profile.',
      'Treat it as practice for the programmes above, not as a credential.',
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

  const trackRecord = (p: ProgramDef) => {
    const names = (p.hof ?? [p.short, p.name]).map((n) => n.toLowerCase());
    const hits = achievers.flatMap((a) =>
      (a.programs ?? [])
        .filter((x) => names.includes(x.name.toLowerCase()))
        .map((x) => x.org?.trim())
    );
    const orgs = [...new Set(hits.filter((o): o is string => !!o))];
    return { count: hits.length, orgs };
  };

  return (
    <main className="min-h-screen bg-panel">
      <div className="max-w-4xl mx-auto px-4 pt-14 pb-24">
        <Link href="/" className="text-sm text-ink-soft hover:text-ink transition-colors">← Home</Link>

        <h1 className="text-4xl font-[650] text-ink tracking-tight mt-6 mb-3">Open source programs</h1>
        <p className="text-ink-mid max-w-2xl leading-relaxed">
          The programmes NST students apply to, with their real application windows, and the
          conferences that fund students to attend. Where NST students have been selected, it
          comes from the <Link href="/achievers" className="underline underline-offset-2 hover:text-ink">Hall of Fame</Link>.
        </p>

        <div className="mt-8">
          <NextCycleHighlight programs={PROGRAMS.map((p) => ({ id: p.id, short: p.short }))} />
        </div>

        {/* Overview */}
        <section className="mt-12">
          <div className="grid grid-cols-[1.1fr_1.5fr_1fr] gap-x-4 text-[11px] uppercase tracking-wider text-ink-soft border-b border-line pb-2">
            <span>Program</span><span>Applications</span><span>Stipend</span>
          </div>
          <ul className="divide-y divide-line">
            {PROGRAMS.map((p) => (
              <li key={p.id} className="grid grid-cols-[1.1fr_1.5fr_1fr] gap-x-4 py-3 text-sm">
                <a href={`#${p.id}`} className="font-[550] text-ink hover:text-brand-600 transition-colors">{p.short}</a>
                <span className="text-ink-mid">{p.applications.split('.')[0]}</span>
                <span className="text-ink-mid">{p.stipend.split(',')[0]}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Details */}
        <div className="mt-16 space-y-16">
          {PROGRAMS.map((p) => {
            const nst = trackRecord(p);
            return (
              <section key={p.id} id={p.id} className="scroll-mt-20">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <h2 className="text-2xl font-[650] text-ink">{p.name}</h2>
                  <a href={p.link} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-ink-soft hover:text-brand-600 transition-colors">
                    {p.link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} ↗
                  </a>
                </div>
                <p className="text-xs text-ink-soft mt-0.5">{p.org}</p>
                <p className="text-ink-mid text-sm leading-relaxed mt-4 max-w-2xl">{p.desc}</p>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-5 text-sm border-t border-line pt-5">
                  {[
                    ['Applications', p.applications],
                    ['Runs', p.runs],
                    ['Stipend', p.stipend],
                    ['Eligibility', p.eligibility],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[11px] uppercase tracking-wider text-ink-soft">{k}</dt>
                      <dd className="text-ink-mid mt-0.5">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5">
                  <ProgramCycleCountdown programId={p.id} />
                </div>

                <ul className="mt-5 space-y-1.5 text-sm text-ink-mid list-disc pl-5 max-w-2xl">
                  {p.tips.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>

                <p className="mt-5 text-sm text-ink-soft">
                  {nst.count > 0 ? (
                    <>
                      <span className="text-ink font-[550]">{nst.count} NST {nst.count === 1 ? 'selection' : 'selections'}</span>
                      {nst.orgs.length > 0 && <> — {nst.orgs.join(' · ')}</>}
                      {' · '}
                      <Link href="/achievers" className="underline underline-offset-2 hover:text-ink">Hall of Fame</Link>
                    </>
                  ) : (
                    'No NST selection recorded yet.'
                  )}
                </p>
              </section>
            );
          })}
        </div>

        {/* Conferences */}
        <section id="conferences" className="mt-20 scroll-mt-20">
          <h2 className="text-2xl font-[650] text-ink">Conferences</h2>
          <p className="text-ink-mid text-sm mt-2 max-w-2xl leading-relaxed">
            Most of these fund students to attend or have no ticket at all. Students who spoke at one are
            listed in the <Link href="/achievers" className="underline underline-offset-2 hover:text-ink">Hall of Fame</Link>.
          </p>
          <ul className="divide-y divide-line border-t border-line mt-6">
            {CONFERENCES.map((c) => (
              <li key={c.name} className="py-3 grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1.6fr] gap-x-6 gap-y-1 text-sm">
                <div>
                  <a href={c.link} target="_blank" rel="noopener noreferrer"
                    className="font-[550] text-ink hover:text-brand-600 transition-colors">{c.name}</a>
                  <span className="text-ink-soft"> · {c.where}</span>
                </div>
                <div className="text-ink-mid">
                  {c.when}
                  <span className="text-ink-soft"> · {c.edition}</span>
                </div>
                <div className="text-ink-mid">{c.support || <span className="text-ink-soft">—</span>}</div>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-ink-soft text-xs mt-16">
          Dates are from each programme&apos;s 2026 timeline and conference announcements as of October 2026.
          Confirm on the official site before planning around one.
        </p>
      </div>
    </main>
  );
}
