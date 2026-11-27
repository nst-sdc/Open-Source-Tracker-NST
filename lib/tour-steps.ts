/**
 * lib/tour-steps.ts — Kairi's film: scenes that play through on their own
 * over the live site. Each scene names a page (href, with any query it
 * needs) and an element on it marked with a matching `data-tour`
 * attribute; app/components/GuidedTour.tsx spotlights it and Kairi says
 * the line, then the next scene starts when she finishes. The scene index
 * travels in the `tour` query parameter, so the film crosses pages.
 *
 * Kairi is a woman in her late twenties; the voice picked for narration
 * follows that. The story is about a student's journey, not the ranking.
 */
export interface TourStep {
  href: string;
  anchor: string;
  /** What Kairi says. Short sentences; this is read aloud. */
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  { href: '/', anchor: 'home-stats',
    text: 'Hi. I’m Kairi. Let me tell you how this place can take you from your first pull request to a summer inside a real project. Everything you see here came from GitHub this morning. Nobody typed it in.' },
  { href: '/', anchor: 'home-chart',
    text: 'This is the heartbeat of the community: pull requests merged, month by month, by students like you. Every one of those was a maintainer somewhere saying yes to one of us.' },
  { href: '/get-started', anchor: 'rules',
    text: 'Everyone starts here. A few rules, written from mistakes we learned the hard way, in the maintainers’ own words. Read them once, and you will never be the student who gets banned for a pull request they could not explain.' },
  { href: '/repo-activity', anchor: 'repo-input',
    text: 'Before you give a project your evenings, check its pulse. Paste any repository and I show you who is contributing, how fast maintainers review, and whether anyone is merging at all. A quiet repo will waste your month. A busy one will teach you.' },
  { href: '/contributors?org=apache', anchor: 'community-chart',
    text: 'Then find your people. Search an organisation, Apache here, and the students from NST already inside it appear, with the rhythm of their work there. They know the maintainers, the channels, and what actually gets merged. Ten minutes with one of them saves you weeks.' },
  { href: '/contributors/bitflicker64', anchor: 'socials',
    text: 'Open a profile and their socials are right there. Write to them. Most of our best contributors started with one message to someone a year ahead of them. Add your own links, so the next student can find you.' },
  { href: '/contributors/bitflicker64', anchor: 'contribution-chart',
    text: 'Your own page grows as you go. Green is merged, blue is still open, red was closed. The red ones are not failures; they are the fastest lessons you will ever get, if you read what the maintainer wrote.' },
  { href: '/contributors', anchor: 'check-work-cta',
    text: 'When you are not sure what counts, ask me. Sign in, and I show you exactly which of your work the tracker sees, what is flagged, and why. No surprises.' },
  { href: '/programs', anchor: 'programs-compare',
    text: 'And when you are ready, the doors: Google Summer of Code, LFX Mentorship, Outreachy, Summer of Bitcoin. Paid, remote, with a mentor from a real project. The countdown at the top right of every page is always the next one opening.' },
  { href: '/organizations', anchor: 'org-filters',
    text: 'Over a thousand organisations, filtered by the languages you love and the programmes you want. Pick two or three, then go back and find the students already there.' },
  { href: '/achievers', anchor: 'achievers-grid',
    text: 'These are students from here who made it. They started exactly where you are: one issue, one nervous pull request, one message to a senior. Ask them how they did it. They will tell you.' },
  { href: '/tour', anchor: 'tour-start',
    text: 'That is the journey. Explore, connect, contribute, and come back here whenever you lose the thread. I will be around. Welcome.' },
];

export const tourHref = (i: number): string => {
  const s = TOUR_STEPS[i];
  return `${s.href}${s.href.includes('?') ? '&' : '?'}tour=${i}`;
};
