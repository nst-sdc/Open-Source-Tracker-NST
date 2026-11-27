import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { KAIRI_NAME, KAIRI_PATH } from '@/lib/kairi';
import { tourHref } from '@/lib/tour-steps';

export const metadata: Metadata = {
  title: 'Tour — Opensource Tracker NST',
  description: 'Kairi walks you through the NST open source tracker: the leaderboard, your profile, checking your work, finding people in a repository, programmes, organisations and more.',
};

/**
 * A guided tour of the student-facing site, in Kairi's voice: a video at
 * the top, then one card per feature with a screenshot and a link. The
 * video comes from, in order: TOUR_VIDEO_URL (a direct .mp4/.webm link, or
 * a YouTube link), or a file dropped at public/tour/walkthrough.mp4 and
 * served by the app. With neither, a "coming soon" card. Screenshots live
 * in public/tour.
 */
const FEATURES: Array<{ href: string; title: string; image: string; desc: string; tips: string[]; soon?: boolean }> = [
  {
    href: '/', title: 'Home', image: 'home',
    desc: 'The front page: this week’s top contributors, how many students are shipping, merged pull requests per month, and students selected for programmes.',
    tips: ['Hover the chart for any month’s numbers', 'Everything here is pulled from GitHub, nothing is self-reported'],
  },
  {
    href: '/contributors', title: 'Leaderboard', image: 'leaderboard',
    desc: 'Every NST student ranked by real merged pull requests, with a rating that weighs the size and substance of each one. Switch the period, filter by campus or year, or search a name.',
    tips: ['Try a search: kushagar, yatharth, himanshu verma, rakshit, arshil', 'Only pull requests to real projects count; spam and self-merges are filtered out'],
  },
  {
    href: '/contributors?org=apache', title: 'Search an organisation', image: 'org',
    desc: 'Type an organisation such as apache, numpy or sugarlabs and the leaderboard narrows to NST students who have merged there, with that organisation’s own monthly chart: who is active and how many.',
    tips: ['Useful before picking an organisation for GSoC or LFX', 'The chart’s hover card shows students active and what became of the PRs opened that month'],
  },
  {
    href: '/contributors', title: 'Your profile', image: 'profile',
    desc: 'Each student has a page: a contribution chart, merged and open pull requests, issues, organisations you have contributed to, badges and the socials you add.',
    tips: ['Open yours from the leaderboard or /contributors/your-github-login', 'Shown here: Himanshu Verma, second year, Rishihood'],
  },
  {
    href: '/check-work', title: 'Check my work', image: 'check-work',
    desc: 'Sign in with GitHub and see exactly which of your pull requests count, which are flagged and why, so there are no surprises on the leaderboard.',
    tips: ['Read-only access to your public GitHub profile', 'If something looks wrong, this page tells you what to fix'],
  },
  {
    href: '/issues', title: 'Common issues', image: 'issues',
    desc: 'The problems students hit most, with the fix for each: a pull request showing hundreds of files that are not yours, a merge that is not counted, a stale branch, and more.',
    tips: ['Check here before asking', 'Each entry is a problem we have actually seen on this tracker'],
  },
  {
    href: '/repo-activity', title: 'Repository activity', image: 'repo-activity',
    desc: 'Paste any public GitHub repository and see its contributors, active pull requests and issues over a chosen period, to judge how alive a project is before you invest time in it.',
    tips: ['Try the repository you are thinking of contributing to', 'Maintainers who merge regularly are the ones to work with'],
  },
  {
    href: '/programs', title: 'Programmes', image: 'programs',
    desc: 'GSoC, LFX Mentorship, Outreachy, Summer of Bitcoin and the rest: what each pays, who is eligible, when applications open, and tips from people who got in.',
    tips: ['Deadlines come fast; the card at the top right of every page counts down to the next one', 'Most selected students had merged PRs in the organisation months before applying'],
  },
  {
    href: '/organizations', title: 'Organisations', image: 'organizations',
    desc: 'Over a thousand organisations across GSoC, LFX, CNCF, Outreachy and more, with their years, slots, languages and topics, and which NST students have contributed to each.',
    tips: ['Filter by programme, language or topic', 'Umbrella organisations list their sub-projects'],
  },
  {
    href: '/achievers', title: 'Hall of fame', image: 'hall-of-fame',
    desc: 'Students from NST who were selected for GSoC, LFX and other programmes, with the organisation and the year.',
    tips: ['Proof that it is doable from here', 'Many of them are reachable on the leaderboard'],
  },
  {
    href: '/get-started', title: 'Get started', image: 'get-started',
    desc: 'The guide for a first contribution: what open source is, why it matters for you, how to find an issue, and the rules that get people banned when broken, in maintainers’ own words.',
    tips: ['Read the rules section before your first pull request', 'Links to the beginner-friendly organisations'],
  },
  {
    href: KAIRI_PATH, title: KAIRI_NAME, image: 'kairi', soon: true,
    desc: 'An assistant that knows this tracker and your own pull requests. Ask why something is flagged, how the rating works, or where to start, and it answers with links to the docs.',
    tips: ['Opens to students soon', 'It can be wrong; check anything important against the docs it links'],
  },
];

/** Screenshot heights at 1280 wide; most are the top 790px of a page. */
const HEIGHTS: Record<string, number> = { 'check-work': 600, leaderboard: 330 };
const DEFAULT_HEIGHT = 790;

type Video = { kind: 'file'; src: string } | { kind: 'youtube'; src: string } | null;

function pickVideo(url: string | undefined): Video {
  if (url) {
    if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return { kind: 'file', src: url };
    const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
    if (m) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  }
  // A file dropped into the repo (or the image) is served by the app itself.
  if (existsSync(join(process.cwd(), 'public', 'tour', 'walkthrough.mp4'))) return { kind: 'file', src: '/tour/walkthrough.mp4' };
  return null;
}

export default function TourPage() {
  const video = pickVideo(process.env.TOUR_VIDEO_URL);
  return (
    <main className="min-h-screen bg-panel">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full bg-brand-0 border border-brand-100 px-3 py-1 text-[11.5px] font-[650] uppercase tracking-wider text-brand-600">Tour</span>
          <h1 className="mt-4 text-4xl md:text-5xl font-[650] tracking-tight text-ink">Hi, I’m Kairi. Let me show you around.</h1>
          <p className="mt-4 text-ink-mid text-lg leading-relaxed">
            I’m the guide built into this tracker. Press play and I will walk you through how students here go from a first pull request to a summer inside a real project: where to look before you commit to a repository, how to find the people who can help you, and how your own page grows along the way.
          </p>
          <div data-tour="tour-start" className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={tourHref(0)} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-solid hover:bg-brand-solid-hover text-white text-sm font-[600] shadow-brand-btn">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              Play the tour
            </Link>
            <span className="text-ink-soft text-sm">About four minutes. It plays through the live site on its own, with me narrating; mute or pause any time.</span>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-ground shadow-card overflow-hidden">
          {video?.kind === 'file' ? (
            <video src={video.src} controls playsInline preload="metadata" poster="/tour/home.jpg" className="aspect-video w-full bg-black">
              Your browser cannot play this video. <a href={video.src}>Download it</a> instead.
            </video>
          ) : video?.kind === 'youtube' ? (
            <div className="aspect-video">
              <iframe src={video.src} title="Tracker walkthrough video" className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          ) : (
            <div className="aspect-video flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-full bg-brand-0 border border-brand-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-brand-600" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              </div>
              <p className="mt-4 text-ink font-[600]">My video walkthrough is coming soon</p>
              <p className="mt-1 text-ink-soft text-sm max-w-md">Until then, I’ll take you through every page below, with a screenshot and what it is for.</p>
            </div>
          )}
        </div>

        <div className="mt-12 space-y-10">
          {FEATURES.map((f, i) => (
            <section key={f.title} className={`grid gap-6 md:gap-10 items-center md:grid-cols-2 ${i % 2 ? 'md:[&>div:first-child]:order-2' : ''}`}>
              <div>
                <div className="text-[11.5px] font-[650] uppercase tracking-wider text-ink-soft">{String(i + 1).padStart(2, '0')}</div>
                <h2 className="mt-1 text-2xl font-[650] tracking-tight text-ink">
                  {f.title}
                  {f.soon && <span className="ml-2 align-middle inline-flex items-center rounded-full border border-gold-400 bg-gold-0 px-2 py-0.5 text-[11px] font-[650] uppercase tracking-wider text-gold-700">Coming soon</span>}
                </h2>
                <p className="mt-3 text-ink-mid leading-relaxed">{f.desc}</p>
                <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
                  {f.tips.map((t) => <li key={t}>· {t}</li>)}
                </ul>
                {!f.soon && <Link href={f.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-[600] text-brand-600 hover:text-brand-500">Open →</Link>}
              </div>
              {f.soon ? (
                <div className="block rounded-2xl border border-line bg-ground shadow-card overflow-hidden opacity-80">
                  <Image src={`/tour/${f.image}.jpg`} alt={`${f.title} page`} width={1280} height={HEIGHTS[f.image] ?? DEFAULT_HEIGHT} className="w-full h-auto" sizes="(min-width: 768px) 50vw, 100vw" />
                </div>
              ) : (
                <Link href={f.href} className="block rounded-2xl border border-line bg-ground shadow-card overflow-hidden hover:border-line-strong transition-colors">
                  <Image src={`/tour/${f.image}.jpg`} alt={`${f.title} page`} width={1280} height={HEIGHTS[f.image] ?? DEFAULT_HEIGHT} className="w-full h-auto" sizes="(min-width: 768px) 50vw, 100vw" />
                </Link>
              )}
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-line bg-ground shadow-card p-6 md:p-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-[650] tracking-tight text-ink">That’s the tour</h2>
            <p className="mt-1 text-ink-mid text-sm">Join the tracker so your work counts, or start with my guide.</p>
          </div>
          <div className="flex gap-2.5">
            <Link href="/join" className="px-4 py-2.5 rounded-xl bg-brand-solid hover:bg-brand-solid-hover text-white text-sm font-[550] shadow-brand-btn">Join the tracker</Link>
            <Link href="/get-started" className="px-4 py-2.5 rounded-xl border border-line hover:border-line-strong text-ink text-sm font-[550]">Get started</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
