/**
 * lib/tour-steps.ts — the guided tour, in Kairi's voice. Each step names a
 * page (href, with any query it needs) and an element on it marked with a
 * matching `data-tour` attribute; app/components/GuidedTour.tsx spotlights
 * that element and shows the text. Steps are addressed by index in the
 * `tour` query parameter, so the tour survives page navigation.
 */
export interface TourStep {
  href: string;
  anchor: string;
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  { href: '/', anchor: 'home-stats', title: 'The whole community in four numbers',
    text: 'Students tracked, who is actively contributing, pull requests, and merged ones. I read all of it from GitHub every few minutes; nobody reports anything by hand.' },
  { href: '/', anchor: 'home-top', title: 'Who is on top this week',
    text: 'The five students with the most merged work in the last seven days. It resets every week, so a good week gets you here.' },
  { href: '/', anchor: 'home-chart', title: 'Merged pull requests, month by month',
    text: 'The community’s momentum. Hover any month and I show the count and how many students were behind it.' },
  { href: '/contributors', anchor: 'search', title: 'Find anyone',
    text: 'Type a name or a GitHub login. Try kushagar, yatharth, himanshu verma, rakshit or arshil. Type an organisation like apache and the page narrows to the students who have merged there.' },
  { href: '/contributors', anchor: 'leaderboard-table', title: 'The ranking',
    text: 'Rank, rating, campus, year, merged, open, issues. The rating weighs how substantial each merged pull request was, so one real fix beats ten typo changes. Click a name to open their page.' },
  { href: '/contributors?org=apache', anchor: 'community-chart', title: 'Inside an organisation',
    text: 'This is Apache: the NST students who have merged there and the organisation’s own monthly chart. Before you dive into a project, find the seniors already in it and reach out. They know the maintainers and what gets merged.' },
  { href: '/contributors/bitflicker64', anchor: 'profile-header', title: 'A student’s page',
    text: 'Himanshu, second year, Rishihood. Projects, acceptance rate, activity, and the biggest project he has landed in. Every student has one of these.' },
  { href: '/contributors/bitflicker64', anchor: 'socials', title: 'Socials, so people can reach you',
    text: 'Add your LinkedIn, X or site once you are signed in. When you spot someone in an organisation you want to join, this is how you connect with them.' },
  { href: '/contributors/bitflicker64', anchor: 'contribution-chart', title: 'Contribution history',
    text: 'Pull requests opened each month: merged in green, open in blue, closed in red. Yours will look like this too, and the red ones are worth understanding.' },
  { href: '/repo-activity', anchor: 'repo-input', title: 'Scan any repository',
    text: 'Paste a GitHub repository and I show you the traffic in it: who is contributing, how many pull requests and issues are moving, and how active the maintainers are, who merges and how often. Judge a project before you spend evenings on it.' },
  { href: '/programs', anchor: 'programs-compare', title: 'The programmes',
    text: 'GSoC, LFX Mentorship, Outreachy, Summer of Bitcoin and more: what they pay, who is eligible, when applications open. The countdown at the top right of every page is the next deadline.' },
  { href: '/organizations', anchor: 'org-filters', title: 'Over a thousand organisations',
    text: 'Filter by programme, language or topic to find organisations that fit you, with their years, slots, and which NST students have contributed to each.' },
  { href: '/achievers', anchor: 'achievers-grid', title: 'Students who got in',
    text: 'Selected for GSoC, LFX and other programmes, from here. Most are reachable through their profiles; ask them how they did it.' },
  { href: '/get-started', anchor: 'rules', title: 'The rules, in maintainers’ own words',
    text: 'Read these before your first pull request. Each one is something that has got a student blocked or banned, and the quotes are real comments left on our students’ pull requests.' },
];

export const tourHref = (i: number): string => {
  const s = TOUR_STEPS[i];
  return `${s.href}${s.href.includes('?') ? '&' : '?'}tour=${i}`;
};
