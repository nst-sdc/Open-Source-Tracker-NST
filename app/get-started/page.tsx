import Link from 'next/link';

export const metadata = {
  title: 'Get Started — Opensource Tracker NST',
  description:
    'A plain-language introduction to open source for people who have never contributed: what the words mean, why it is worth doing, and how to get your first change accepted.',
};

/* Every term a first-timer will hit in their first week, defined before the page
   uses it anywhere else. */
const glossary = [
  {
    term: 'Repository (or "repo")',
    def: 'One project\'s code, kept in a single folder along with a record of every change ever made to it. When people say "the React repo", they mean all of React\'s code and its history.',
  },
  {
    term: 'GitHub',
    def: 'The website where most open source repositories live. It hosts the code, the discussions, and the review process. You will need a free account.',
  },
  {
    term: 'Maintainer',
    def: 'A person who runs the project and decides which changes get accepted. Usually a volunteer. Usually busy.',
  },
  {
    term: 'Issue',
    def: 'A post on the repository describing a bug, or a feature somebody wants. This is where you find work to do. Anyone can open one.',
  },
  {
    term: 'Fork',
    def: 'Your own copy of someone else\'s repository, saved under your GitHub account. You need one because you are not allowed to change theirs directly.',
  },
  {
    term: 'Clone',
    def: 'Downloading a repository onto your own computer so you can open it in a code editor and run it.',
  },
  {
    term: 'Branch',
    def: 'A separate line of work inside a repository. You put your changes on their own branch so the main copy stays untouched while you experiment.',
  },
  {
    term: 'Commit',
    def: 'One saved change, together with a short message explaining what you changed and why. A contribution is usually made of a few commits.',
  },
  {
    term: 'Push',
    def: 'Uploading the commits from your computer back up to GitHub, so other people can see them.',
  },
  {
    term: 'Pull request (or "PR")',
    def: 'A formal request asking the maintainers to take your changes into the project. Opening a PR is the actual act of contributing.',
  },
  {
    term: 'Review',
    def: 'A maintainer reading your pull request and asking for changes before they accept it. This is normal and happens to everyone, including senior engineers. It is not criticism of you.',
  },
  {
    term: 'Merge',
    def: 'When a maintainer accepts your pull request and your code becomes part of the real project. This is the moment people mean by "my first contribution".',
  },
  {
    term: 'Upstream',
    def: 'The original repository you forked from. Your fork can fall behind it while you work, which is why you will see people talk about "syncing with upstream".',
  },
  {
    term: 'CI (continuous integration)',
    def: 'Automated checks that run on your pull request to confirm your change did not break anything. If CI fails, fix it before asking for a review.',
  },
];

const giants = [
  {
    name: 'Linux',
    category: 'Operating system',
    desc: 'The operating system that runs most of the internet. Every Android phone, almost every web server, and the machines behind AWS, Google Cloud, and Azure run on it.',
    origin:
      'Linus Torvalds started it in 1991 as a personal hobby project, to understand how his own computer\'s processor worked. He gave the code away. Thousands of people have improved it since.',
    users: 'AWS, NASA, SpaceX, Tesla',
  },
  {
    name: 'Android',
    category: 'Mobile platform',
    desc: 'The phone operating system built on top of Linux. Because the code is public, any phone manufacturer can build on it instead of writing an operating system from scratch.',
    origin:
      'Android began as a small startup aimed at digital cameras. Google bought it and published the code as the Android Open Source Project, which is why so many companies could start making smartphones at once.',
    users: 'Samsung, Google, Xiaomi, OnePlus',
  },
  {
    name: 'Python',
    category: 'Programming language',
    desc: 'A programming language that is free for anyone to use and improve. Most of today\'s AI tools, including the libraries behind ChatGPT, are written in it.',
    origin:
      'Guido van Rossum built the first version over a Christmas holiday in 1989 to keep himself occupied, and published it. It is now one of the most used languages in the world.',
    users: 'OpenAI, Meta, NASA, Netflix',
  },
  {
    name: 'VLC',
    category: 'Media player',
    desc: 'The media player that opens practically any video or audio file, with no ads and no tracking, because no company needs to make money from it.',
    origin:
      'Students at a Paris engineering school wrote it in 1996 to stream television around their dorm network. The volunteers who maintain it have turned down buyout offers to keep it free.',
    users: 'Several billion downloads worldwide',
  },
  {
    name: 'Git and VS Code',
    category: 'Developer tools',
    desc: 'Git records the history of a codebase and lets many people work on it at once. VS Code is the editor most developers write that code in. You will use both constantly.',
    origin:
      'Linus Torvalds wrote Git in about ten days because he was frustrated with the existing tools. Microsoft published VS Code\'s source, which is why it has so many community-built extensions.',
    users: 'Effectively the whole industry',
  },
  {
    name: 'Blender',
    category: '3D and graphics',
    desc: 'A 3D animation and visual effects tool that competes with software costing thousands of pounds per licence, and is free because its users own it.',
    origin:
      'When the company behind Blender went bankrupt in 2002, its community raised €110,000 in seven weeks to buy the source code back and release it publicly.',
    users: 'Netflix, Ubisoft, EA, NASA',
  },
];

const benefits = [
  {
    title: 'You work on code real people use',
    desc: 'Tutorial projects are thrown away when the tutorial ends. A change you merge into an open source project keeps running on other people\'s machines. That difference is obvious to anyone reading your profile.',
  },
  {
    title: 'Your work is public and permanent',
    desc: 'Anyone can open your GitHub profile and read the actual code you wrote and the discussion around it. You do not have to convince them you can do the work; they can check.',
  },
  {
    title: 'You learn to read code you did not write',
    desc: 'Most of a working developer\'s time goes on understanding an existing codebase, not writing new code. Open source is the only place you can practise that before your first job.',
  },
  {
    title: 'Experienced engineers review your work for free',
    desc: 'A maintainer explaining why your approach will not work is career-changing feedback that nobody is charging you for. Take it seriously and it will make you better quickly.',
  },
  {
    title: 'Some programmes pay',
    desc: 'Google Summer of Code, LFX Mentorship, Outreachy, and Summer of Bitcoin pay students stipends, commonly between $3,000 and $6,600, to contribute over a summer. They select from people with an existing contribution record.',
  },
  {
    title: 'You meet people who are further along',
    desc: 'You end up in the same review threads as engineers at Google, Meta, Mozilla, and research labs. Being a known, reliable contributor is how a lot of people find their first opportunity.',
  },
];

const onboardingSteps = [
  {
    n: '1',
    title: 'Set up GitHub and learn just enough Git',
    desc: 'Create a free GitHub account. Then learn five things and no more for now: how to fork a repository, clone it to your computer, make a branch, commit a change, and push it back. You do not need to understand all of Git before you start. You need those five.',
  },
  {
    n: '2',
    title: 'Pick a project you already use',
    desc: 'Not the biggest or most famous one. A tool or library you have personally used, so you already know what it is for and can tell when it is behaving oddly. If you are learning React, look at a React library you have installed.',
  },
  {
    n: '3',
    title: 'Read CONTRIBUTING.md before anything else',
    desc: 'Almost every serious repository has a file called CONTRIBUTING.md at the top level. It tells you how that project wants changes submitted, how to run its tests, and what it will reject. Reading it first is the single clearest signal that you are not wasting the maintainer\'s time.',
  },
  {
    n: '4',
    title: 'Get the project running on your own machine first',
    desc: 'Before you change a single line, follow the setup instructions until you can build and run it locally. This often takes an afternoon and teaches you more about the project than reading the code does. If the instructions are broken, fixing them is itself a genuinely useful first contribution.',
  },
  {
    n: '5',
    title: 'Find an issue labelled for newcomers',
    desc: 'Open the repository\'s Issues tab and filter by labels like "good first issue", "beginner friendly", or "documentation". Maintainers add these labels specifically to mark work that does not need deep knowledge of the codebase.',
  },
  {
    n: '6',
    title: 'Comment on the issue before you start',
    desc: 'Write something like "I would like to work on this, is it still open?" and wait for a reply. This stops two people doing the same work, and gives the maintainer a chance to warn you if the issue is harder than it looks.',
  },
  {
    n: '7',
    title: 'Reproduce the problem, then make the smallest fix that works',
    desc: 'Run the code and see the bug happen with your own eyes before you try to fix it. Then change as little as possible. A five-line fix that clearly solves the stated problem gets merged. A 200-line rewrite that also reorganises things you did not like will not.',
  },
  {
    n: '8',
    title: 'Open the pull request, then stay for the review',
    desc: 'Explain what you changed, why, and how the reviewer can check it themselves. Then keep watching it. Replying to review comments within a day or two is what separates contributors maintainers remember from the ones they do not.',
  },
];

const coreSkills = [
  {
    title: 'Git and GitHub',
    items: [
      'Forking and cloning a repository',
      'Working on a branch instead of the main copy',
      'Writing commit messages someone else can read',
      'Keeping your fork in sync with the original',
      'Untangling conflicts when two people edit the same lines',
    ],
  },
  {
    title: 'Finding your way around code',
    items: [
      'Following a feature through unfamiliar files',
      'Working out what a function does from its tests',
      'Searching a large codebase quickly',
      'Reading documentation written for other developers',
      'Knowing when to stop reading and start experimenting',
    ],
  },
  {
    title: 'Communicating with a team',
    items: [
      'Writing a bug report someone can act on',
      'Asking a question that includes what you already tried',
      'Responding to review comments without taking them personally',
      'Explaining why you chose one approach over another',
      'Saying clearly when you are stuck or cannot continue',
    ],
  },
  {
    title: 'Running things locally',
    items: [
      'Setting up a project from its README',
      'Running the test suite and reading the failures',
      'Using linters and formatters before you push',
      'Working out why the automated checks failed',
      'Basic Docker, when a project needs it',
    ],
  },
];

const dontDo = [
  {
    title: 'Do not submit AI-generated code you cannot explain',
    desc: 'Pasting output from ChatGPT, Copilot, or Claude into a pull request without understanding it is treated as plagiarism. Maintainers spot it easily, because they ask a follow-up question and the answer never comes. Many large projects now ban it outright.',
  },
  {
    title: 'Do not submit typo fixes to inflate your count',
    desc: 'Changing one letter in a README, adding blank lines, or reformatting whitespace purely to have another merged PR is spam. It is one of the fastest ways to get blocked by a repository and rejected from paid programmes.',
  },
  {
    title: 'Do not open a pull request and disappear',
    desc: 'A maintainer who reviews your work and then hears nothing for three weeks has wasted their evening. If you cannot continue, that is completely fine. Say so in a comment and close the pull request yourself.',
  },
  {
    title: 'Do not copy code you do not understand',
    desc: 'Code lifted from Stack Overflow, a blog, or another repository often carries assumptions that do not hold in this project, and sometimes a licence that does not allow it. If you cannot explain every line of your change, it is not ready to submit.',
  },
];

const doDo = [
  {
    title: 'Do use AI to understand things faster',
    desc: 'Asking an AI to explain an unfamiliar algorithm, walk you through an error message, or clarify syntax is a good use of it. Learn from the explanation, then write and understand the final code yourself. The rule is about understanding, not about tools.',
  },
  {
    title: 'Do ask questions in public',
    desc: 'Ask on the issue rather than in a private message. Someone else will hit the same problem and find your question. Include what you tried and what happened, so a maintainer can help in one reply instead of five.',
  },
];

function SectionHeading({
  id,
  title,
  intro,
}: {
  id?: string;
  title: string;
  intro?: string;
}) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="text-2xl md:text-3xl font-[650] tracking-tight text-ink">
        {title}
      </h2>
      {intro && <p className="mt-2.5 text-[15px] leading-relaxed text-ink-mid">{intro}</p>}
    </div>
  );
}

const JUMP_LINKS = [
  { href: '#what-is-open-source', label: 'What it is' },
  { href: '#words', label: 'The words' },
  { href: '#projects', label: 'Projects you use' },
  { href: '#why', label: 'Why bother' },
  { href: '#first-contribution', label: 'Your first contribution' },
  { href: '#rules', label: 'Rules' },
];

export default function GetStartedPage() {
  return (
    <main className="min-h-screen bg-panel">
      <header className="border-b border-line bg-ground">
        <div className="max-w-4xl mx-auto px-4 pt-8 pb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>

          <h1 className="mt-6 text-4xl md:text-5xl font-[650] tracking-tight text-ink">
            Get started with open source
          </h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-mid">
            Open source means a project&apos;s code is published in public and anyone is
            allowed to help improve it. This page assumes you have never done that
            before. It explains what the words mean, why it is worth your time, and
            what to actually do first.
          </p>

          <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-1.5">
            {JUMP_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="rounded-full border border-line-strong bg-ground px-3 py-1 text-xs font-medium text-ink-soft hover:border-line-heavy hover:text-ink transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-14 space-y-16">
        {/* What it is */}
        <section id="what-is-open-source" className="scroll-mt-[76px]">
          <SectionHeading title="What open source actually means" />

          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-mid max-w-2xl">
            <p>
              Most software is written privately. A company employs developers, the
              code sits on their servers, and nobody outside can read it. If it has a
              bug that annoys you, your only option is to wait and hope somebody there
              decides to fix it.
            </p>
            <p>
              Open source works the other way round. The full source code is published
              on the internet, usually on GitHub, and anyone is allowed to read it,
              run it, change it, and suggest improvements back to the original
              project. A small group of{' '}
              <strong className="font-[600] text-ink">maintainers</strong> decides
              which suggestions get accepted.
            </p>
            <p>
              It is closer to a recipe published in a magazine than to a factory. You
              can cook it, adjust it, and write to the author saying &ldquo;this step
              works better the other way round&rdquo; — and if they agree, the printed
              recipe changes for everybody.
            </p>
            <p>
              You do not need permission, an invitation, or a job to take part. You do
              need to follow the project&apos;s process, which is what the rest of this
              page is about.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-ground p-5">
              <h3 className="text-sm font-[650] text-ink">Closed source</h3>
              <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-ink-mid">
                <li>You cannot read the code, so you cannot tell what it does.</li>
                <li>A bug gets fixed when the company decides to fix it.</li>
                <li>Every company rebuilds the same basic tools separately.</li>
                <li>Licences can price out small teams and students entirely.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-ground p-5">
              <h3 className="text-sm font-[650] text-ink">Open source</h3>
              <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-ink-mid">
                <li>Anyone can read the code and check what it really does.</li>
                <li>Anyone who can fix a bug is allowed to try.</li>
                <li>Everyone builds on the same shared foundation.</li>
                <li>A student has access to the same tools as a large company.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Glossary */}
        <section id="words" className="scroll-mt-[76px]">
          <SectionHeading
            title="The words you will keep seeing"
            intro="Most of what makes open source feel closed off is vocabulary. Here is the whole set you need for your first contribution. Nothing further down this page assumes more than these."
          />

          <dl className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-ground">
            {glossary.map(({ term, def }) => (
              <div key={term} className="grid gap-1 px-5 py-4 sm:grid-cols-[190px_1fr] sm:gap-5">
                <dt className="text-sm font-[650] text-ink">{term}</dt>
                <dd className="text-[14px] leading-relaxed text-ink-mid">{def}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-sm text-ink-soft">
            When one of these goes wrong in practice, the{' '}
            <Link
              href="/issues"
              className="text-brand-600 underline underline-offset-2 decoration-brand-200 hover:decoration-brand-600 transition-colors"
            >
              common issues page
            </Link>{' '}
            has the exact commands to get out of it.
          </p>
        </section>

        {/* Projects */}
        <section id="projects" className="scroll-mt-[76px]">
          <SectionHeading
            title="You already depend on open source"
            intro="These are not obscure hobby projects. Each one started small, was given away for free, and ended up underneath things you use every day."
          />

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {giants.map((g) => (
              <article key={g.name} className="rounded-2xl border border-line bg-ground p-5 card-hover">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-[650] text-ink">{g.name}</h3>
                  <span className="text-[11px] text-ink-soft">{g.category}</span>
                </div>
                <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">{g.desc}</p>
                <p className="mt-3 border-l-2 border-line-heavy pl-3 text-[13px] leading-relaxed text-ink-soft">
                  {g.origin}
                </p>
                <p className="mt-4 border-t border-line pt-3 text-[11px] text-ink-soft">
                  Used by {g.users}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Student spotlight */}
        <section id="student-spotlight" className="scroll-mt-[76px]">
          <SectionHeading
            title="Students here are already building these"
            intro="Two projects written and maintained by Newton School of Technology students, published in the open for anyone to use or improve."
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <a
              href="https://github.com/bitflicker64/Termstory"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-line bg-ground p-5 card-hover"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-[650] text-ink group-hover:text-brand-600 transition-colors">
                  Termstory
                </h3>
                <span className="text-[11px] text-ink-soft">@bitflicker64</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">
                Turns your terminal history into a readable timeline, grouping commands
                into sessions and matching them up with the commits you made.
              </p>
              <span className="mt-4 inline-block text-[13px] font-medium text-brand-600">
                View on GitHub →
              </span>
            </a>

            <a
              href="https://github.com/Dreamstick9/filedrop"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-line bg-ground p-5 card-hover"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-[650] text-ink group-hover:text-brand-600 transition-colors">
                  filedrop
                </h3>
                <span className="text-[11px] text-ink-soft">@Dreamstick9</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">
                Shares files across your local network, encrypted in the browser with
                AES-256-GCM, with a QR code so a phone can pick them up.
              </p>
              <span className="mt-4 inline-block text-[13px] font-medium text-brand-600">
                View on GitHub →
              </span>
            </a>
          </div>
        </section>

        {/* Why */}
        <section id="why" className="scroll-mt-[76px]">
          <SectionHeading
            title="Why bother contributing"
            intro="Beyond it being satisfying, there are concrete reasons this is worth your evenings."
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {benefits.map((b) => (
              <div key={b.title} className="rounded-2xl border border-line bg-ground p-5">
                <h3 className="text-sm font-[650] text-ink">{b.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section id="first-contribution" className="scroll-mt-[76px]">
          <SectionHeading
            title="Your first contribution, step by step"
            intro="In order. Steps 3 and 4 are the ones beginners skip, and skipping them is the most common reason a first pull request goes nowhere."
          />

          <ol className="mt-6 space-y-4">
            {onboardingSteps.map((step) => (
              <li key={step.n} className="flex gap-4 rounded-2xl border border-line bg-ground p-5">
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-brand-0 text-sm font-[650] text-brand-600">
                  {step.n}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-[650] leading-snug text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-mid">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Skills */}
        <section className="scroll-mt-[76px]">
          <SectionHeading
            title="What you will pick up along the way"
            intro="Nobody teaches most of this on a course. You learn it by having your work reviewed by someone who has done it for years."
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {coreSkills.map((c) => (
              <div key={c.title} className="rounded-2xl border border-line bg-ground p-5">
                <h3 className="text-sm font-[650] text-ink">{c.title}</h3>
                <ul className="mt-3 space-y-2">
                  {c.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-mid">
                      <span aria-hidden="true" className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-line-heavy" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Rules */}
        <section id="rules" className="scroll-mt-[76px]">
          <SectionHeading
            title="Rules worth taking seriously"
            intro="Open source runs on the goodwill of volunteers, and your GitHub username follows you for the rest of your career. Breaking these gets people blocked from repositories and rejected from paid programmes."
          />

          <div className="mt-6 space-y-3">
            {dontDo.map((g) => (
              <div key={g.title} className="rounded-2xl border border-error-100 bg-error-0 p-5">
                <h3 className="text-sm font-[650] text-error-600">{g.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mid">{g.desc}</p>
              </div>
            ))}
            {doDo.map((g) => (
              <div key={g.title} className="rounded-2xl border border-success-100 bg-success-0 p-5">
                <h3 className="text-sm font-[650] text-success-600">{g.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mid">{g.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-line bg-ground px-6 py-8">
          <h2 className="text-xl font-[650] tracking-tight text-ink">Ready to start</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
            Pick a project, find an issue labelled for newcomers, and comment on it.
            Once your first pull request is open, this tracker will pick it up.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/contributors"
              className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-brand-btn hover:bg-brand-700 transition-colors"
            >
              See what others are shipping
            </Link>
            <Link
              href="/issues"
              className="rounded-lg border border-line-strong bg-ground px-3.5 py-2 text-sm font-medium text-ink-mid hover:border-line-heavy hover:text-ink transition-colors"
            >
              When something goes wrong
            </Link>
            <Link
              href="/achievers"
              className="rounded-lg border border-line-strong bg-ground px-3.5 py-2 text-sm font-medium text-ink-mid hover:border-line-heavy hover:text-ink transition-colors"
            >
              Hall of Fame
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
