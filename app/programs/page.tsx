import Link from 'next/link';

export const metadata = { title: 'Open Source Programs — Opensource Tracker NST' };

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
    stipend: '$3,000 – $6,600+',
    duration: '12 weeks (June – August)',
    eligibility: 'Students 18+ worldwide. No degree required.',
    deadline: 'Applications typically open in March',
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
    nst: 'NST students have been selected into GSoC at Python Software Foundation, Google DeepMind, SymPy, Oppia, VideoLAN, KDE Community, JSON Schema, and University of Alaska Anchorage.',
  },
  {
    id: 'lfx',
    name: 'LFX Mentorship',
    short: 'LFX',
    color: 'text-violet-400',
    accent: 'border-violet-500/30',
    bg: 'bg-violet-500/5',
    dot: 'bg-violet-500',
    dotBorder: 'border-violet-500/40',
    stipend: '$3,000 – $6,600',
    duration: '12 weeks, runs 3 terms per year',
    eligibility: 'Students and new contributors globally',
    deadline: 'Applications open 3 times a year (Spring, Summer, Fall)',
    org: 'Linux Foundation',
    link: 'https://mentorship.lfx.linuxfoundation.org',
    desc: 'The Linux Foundation\'s mentorship program connecting new contributors with experienced open source mentors across CNCF, Kubernetes, Prometheus, Envoy, Hyperledger, and dozens of other major cloud-native and enterprise projects. Great for those interested in infrastructure, DevOps, and cloud-native technologies.',
    tips: [
      'Browse projects on the LFX portal and filter by technology or interest',
      'Make early contributions to shortlisted projects — competition is high',
      'Write a detailed application explaining your background and plan',
      'CNCF and Kubernetes projects are very popular — start early',
      'Each term has different projects, so check back each cycle',
    ],
    nst: 'NST students have contributed to Kubernetes, eBPF tooling, and CNCF projects through LFX.',
  },
  {
    id: 'outreachy',
    name: 'Outreachy',
    short: 'Outreachy',
    color: 'text-green-400',
    accent: 'border-green-500/30',
    bg: 'bg-green-500/5',
    dot: 'bg-green-400',
    dotBorder: 'border-green-500/40',
    stipend: '$7,000',
    duration: '3 months',
    eligibility: 'People underrepresented in tech. Specific eligibility criteria applies — check the site.',
    deadline: 'Applications typically open in January and August',
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
    nst: 'NST students have interned at Wikimedia Foundation and GNOME through Outreachy.',
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
    stipend: '$3,000 + 0.1 BTC',
    duration: '12 weeks (June – August)',
    eligibility: 'University students globally with interest in Bitcoin',
    deadline: 'Applications open in February–March',
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
    nst: 'NST students have worked on Lightning Network payment tooling and Bitcoin Script testing infrastructure.',
  },
  {
    id: 'mlh',
    name: 'MLH Fellowship',
    short: 'MLH',
    color: 'text-error-600',
    accent: 'border-error-100',
    bg: 'bg-error-0',
    dot: 'bg-error-400',
    dotBorder: 'border-error-100',
    stipend: '$5,000 (stipend varies by track)',
    duration: '12 weeks',
    eligibility: 'Students and recent graduates globally',
    deadline: 'Rolling applications — check MLH site for current batch',
    org: 'Major League Hacking',
    link: 'https://fellowship.mlh.io',
    desc: 'The MLH Fellowship is a 12-week internship alternative for software engineers. Fellows contribute to open source projects used by companies like Meta, GitHub, and others, or build their own open source projects. There are multiple tracks: Open Source, Explorer, and Production Engineering (with Meta). Fellows receive mentorship and a stipend.',
    tips: [
      'Apply early — spots fill up quickly',
      'The Explorer track is good for beginners with no prior OS experience',
      'The Open Source track requires demonstrated contribution ability',
      'Prepare a strong GitHub profile with real projects',
      'MLH also runs hackathons — participating helps you get noticed',
    ],
    nst: 'NST students have contributed to open source ML infrastructure through MLH Fellowship.',
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
    deadline: 'Runs every October — register at any time during the month',
    org: 'DigitalOcean + GitHub',
    link: 'https://hacktoberfest.com',
    desc: 'Hacktoberfest is a month-long celebration of open source held every October. Participants who complete 4 pull requests to participating GitHub repos earn a digital reward (previously a t-shirt, now a digital badge). It\'s the best on-ramp for first-time contributors — thousands of repos specifically tag "Hacktoberfest" issues for newcomers.',
    tips: [
      'Perfect for making your first open source contribution',
      'Look for repos tagged with "hacktoberfest" on GitHub',
      'Quality over quantity — spammy PRs will be marked as invalid',
      'Use it as practice for larger programs like GSoC',
      'Many orgs run workshops and events during October — attend them',
    ],
    nst: 'A great starting point for NST students to build their first contribution track record before applying to bigger programs.',
  },
  {
    id: 'gsod',
    name: 'Google Season of Docs',
    short: 'GSoD',
    color: 'text-success-600',
    accent: 'border-success-200',
    bg: 'bg-success-500/5',
    dot: 'bg-success-400',
    dotBorder: 'border-success-200',
    stipend: '$3,000 – $6,600+',
    duration: '6 months (May – November)',
    eligibility: 'Technical writers and developers globally, 18+',
    deadline: 'Applications typically open in March–April',
    org: 'Google',
    link: 'https://developers.google.com/season-of-docs',
    desc: 'Google Season of Docs provides support for open source projects to improve their documentation and gives professional technical writers an opportunity to gain experience in open source. It bridges the gap between open source developers and tech writers, supporting projects that need documentation guidance.',
    tips: [
      'Show prior technical writing samples or documentation portfolios',
      'Study the target organization\'s existing documentation gaps thoroughly',
      'Interact with project mentors on their discussion channels early',
      'Write a highly structured proposal outlining documentation goals',
      'Familiarize yourself with Markdown, Sphinx, Docusaurus, or Gitbook',
    ],
    nst: 'NST students with a passion for documentation and technical writing have participated in GSoD.',
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
    stipend: 'Merchandise & Travel Support (No cash stipend)',
    duration: '10 weeks (December – February)',
    eligibility: 'Open to anyone globally, great for beginners',
    deadline: 'Applications typically open in November',
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
    nst: 'NST students have built and improved features for KDE desktop apps and infrastructure through Season of KDE.',
  },
  {
    id: 'asoc',
    name: 'Alibaba Summer of Code',
    short: 'ASoC',
    color: 'text-gold-600',
    accent: 'border-gold-100',
    bg: 'bg-gold-500/5',
    dot: 'bg-gold-400',
    dotBorder: 'border-gold-100',
    stipend: '$1,000 – $3,000+',
    duration: '12 weeks (July – September)',
    eligibility: 'Students 18+ worldwide',
    deadline: 'Applications typically open in May',
    org: 'Alibaba Open Source',
    link: 'https://github.com/alibaba/opensource',
    desc: 'Alibaba Summer of Code is a global program that connects open source mentors with students to develop features for Alibaba\'s high-scale cloud-native, microservice, and database projects (e.g. Dubbo, Nacos, RocketMQ, Sentinel). It is great for students focused on backend infrastructure and cloud technologies.',
    tips: [
      'Gain solid skills in Java, Go, or C++ which are primary Alibaba tools',
      'Study high-concurrency microservice architectures',
      'Contribute to Alibaba open-source repos to build credibility',
      'Outline precise technical designs for scaling database components',
      'Keep communications active on project issues and pull requests',
    ],
    nst: 'NST students have gained enterprise Java and cloud infrastructure skills through ASoC.',
  },
  {
    id: 'hyperledger',
    name: 'Hyperledger Mentorship Program',
    short: 'Hyperledger',
    color: 'text-brand-600',
    accent: 'border-brand-100',
    bg: 'bg-brand-0',
    dot: 'bg-brand-400',
    dotBorder: 'border-brand-200',
    stipend: '$3,000 – $6,600',
    duration: '12 or 24 weeks (Summer/Year-round)',
    eligibility: 'Open to university students and developers worldwide',
    deadline: 'Applications typically open in March–April',
    org: 'Hyperledger Foundation / Linux Foundation',
    link: 'https://wiki.hyperledger.org/display/INTERN',
    desc: 'Sponsored by the Linux Foundation, the Hyperledger Mentorship Program provides opportunities for students to design and implement ledger technologies, cryptographic protocols, smart contracts, and blockchain architectures across projects like Fabric, Besu, Indy, and Sawtooth.',
    tips: [
      'Learn standard blockchain architectures and cryptography principles',
      'Study Golang, Node.js, and Java which are major Hyperledger tools',
      'Familiarize yourself with Docker and container orchestration',
      'Submit proposals directly tackling performance or consensus bugs',
      'Reach out to project leads on the Hyperledger chat portal',
    ],
    nst: 'NST students have designed enterprise ledger features through the Hyperledger Mentorship Program.',
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
    duration: '12 weeks (May – July)',
    eligibility: 'Open to everyone worldwide, very beginner-friendly',
    deadline: 'Applications typically open in March–April',
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
    nst: 'A popular program for NST first-year and second-year students to kickstart their open-source contributions before GSoC.',
  },
  {
    id: 'cncf',
    name: 'CNCF Mentoring Programs',
    short: 'CNCF',
    color: 'text-sky-400',
    accent: 'border-sky-500/30',
    bg: 'bg-sky-500/5',
    dot: 'bg-sky-400',
    dotBorder: 'border-sky-500/40',
    stipend: '$3,000 – $6,600',
    duration: '12 weeks',
    eligibility: 'Students and beginners globally',
    deadline: 'Multiple terms per year — check LFX portal',
    org: 'Cloud Native Computing Foundation',
    link: 'https://github.com/cncf/mentoring',
    desc: 'The Cloud Native Computing Foundation (CNCF) hosts multiple mentoring programs (including GSoC, Outreachy, and LFX terms) to guide beginners. Mentees work directly on Kubernetes, Prometheus, Envoy, CoreDNS, gRPC, and other cloud-native technologies under Linux Foundation mentors.',
    tips: [
      'Have solid skills in Go, Rust, or C++ which power cloud-native tools',
      'Familiarize yourself with microservices, containers, and Docker',
      'Look for the CNCF mentoring GitHub repository to browse project ideas',
      'Make small contributions (fixes, docs, tests) early in target repos',
      'Draft detailed application proposals outlining system designs',
    ],
    nst: 'NST students have contributed to Prometheus and Kubernetes projects through CNCF mentorships.',
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
    stipend: '$1,500 – $3,000+',
    duration: '3 months (July – September)',
    eligibility: 'Students globally, 18+',
    deadline: 'Applications typically open in May',
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
    nst: 'NST students have participated in OSPP developing core open-source infrastructure tools.',
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
    duration: '2 months per term (runs autumn/winter)',
    eligibility: 'Open to anyone worldwide',
    deadline: 'Applications open during the contest terms',
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
    nst: 'NST students have been recognized as Codeheat winners and attended the FOSSASIA Summit.',
  },
  {
    id: 'lkmp',
    name: 'Linux Kernel Mentorship Program',
    short: 'LKMP',
    color: 'text-gold-600',
    accent: 'border-gold-100',
    bg: 'bg-gold-0',
    dot: 'bg-gold-400',
    dotBorder: 'border-gold-100',
    stipend: '$3,000 – $6,600',
    duration: '12 to 24 weeks',
    eligibility: 'Aspiring Linux kernel developers globally',
    deadline: 'Runs 3 terms per year — check LF portal',
    org: 'Linux Foundation',
    link: 'https://mentorship.lfx.linuxfoundation.org',
    desc: 'The Linux Kernel Mentorship Program offers a structured remote learning opportunity to people who are aspiring to be Linux kernel developers. Mentees work directly under the guidance of experienced kernel maintainers and submit kernel patches, gaining deep systems programming experience.',
    tips: [
      'Take the free Linux Foundation kernel introduction courses first',
      'Learn C programming, operating system concepts, and Git workflows',
      'Understand how to send patches via email lists to the Linux kernel',
      'Start by fixing compiler warnings or static analysis checks in the kernel tree',
      'Follow the LKMP guidelines closely to write compliant kernel patches',
    ],
    nst: 'A highly advanced program for NST students specializing in systems engineering and low-level development.',
  },
  {
    id: 'dssg',
    name: 'Data Science for Social Good Fellowship',
    short: 'DSSG',
    color: 'text-brand-600',
    accent: 'border-brand-100',
    bg: 'bg-brand-0',
    dot: 'bg-brand-400',
    dotBorder: 'border-brand-200',
    stipend: 'Varies (Paid summer fellowship)',
    duration: '12 weeks (Summer)',
    eligibility: 'Undergraduate & graduate students in computational/quantitative fields or social sciences',
    deadline: 'Applications typically open in January–February',
    org: 'DSSG Foundation & Partner Universities',
    link: 'https://www.dssgfellowship.org',
    desc: 'The Data Science for Social Good Fellowship is a full-time, paid summer program. Originally launched at the University of Chicago, it brings together aspiring data scientists to apply machine learning, artificial intelligence, and statistics to high-impact challenges in education, healthcare, public safety, and environment under the guidance of expert mentors.',
    tips: [
      'Demonstrate both quantitative strengths (ML/programming) and social commitment',
      'Highlight experience working in interdisciplinary teams (social science + coding)',
      'Prepare strong project samples showing data cleaning, modeling, and insights',
      'Focus your application essays on your personal drive for social impact',
      'Apply individually — teams are formed after selection',
    ],
    nst: 'NST students with machine learning and data science backgrounds have participated in DSSG fellowships.',
  },
];

export default function ProgramsPage() {
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
          <p className="text-ink-soft text-lg max-w-2xl mx-auto leading-relaxed mb-8">
            A guide to the world&apos;s best paid open source programs — stipends, timelines,
            eligibility, and how NST students have fared.
          </p>

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
                <div className="space-y-1 text-xs text-ink-soft">
                  <div className="flex justify-between"><span className="text-ink-soft">Stipend</span><span>{p.stipend}</span></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Duration</span><span>{p.duration.split('(')[0].trim()}</span></div>
                  <div className="flex justify-between"><span className="text-ink-soft">Deadline</span><span>{p.deadline.split('—')[0].trim()}</span></div>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white">
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
              <div className={`px-6 py-4 border-t border-line bg-white`}>
                <span className={`text-xs font-[550] ${p.color}`}>NST track record — </span>
                <span className="text-ink-soft text-xs">{p.nst}</span>
              </div>
            </div>
          </section>
        ))}

        {/* CTA */}
        <section className="rounded-2xl border border-line bg-white p-8 text-center">
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
            ⚠️ Stipends and deadlines shown are approximate — always verify on the official program site before applying.
          </p>
        </section>
      </div>
    </main>
  );
}
