/**
 * Student-built projects featured across the site: the "Built by our
 * community" grid on the home page, "Featured Student Maintainers" on
 * /achievers, and the "Student spotlight" on /get-started.
 *
 * All three pages render from this one list via
 * app/components/CommunityProjectCard.tsx, so adding a project is a single
 * entry here — it shows up everywhere at once. Before this file existed each
 * page had its own hand-written copy of the cards, and they drifted (PR #84
 * added a project to the home page only).
 */
export type CommunityProject = {
  /** Display name, as the maintainer writes it (casing is theirs). */
  name: string;
  /** Two-or-three-word category shown under the name. */
  tagline: string;
  repoUrl: string;
  /** One or two sentences; used on the home and achievers cards. */
  description: string;
  /** Shorter, plainer sentence for the get-started spotlight. */
  summary: string;
  tags: string[];
  author: {
    name: string;
    /** GitHub login — also used to derive the avatar URL. */
    login: string;
  };
};

export const COMMUNITY_PROJECTS: CommunityProject[] = [
  {
    name: 'Termstory',
    tagline: 'Memory engine',
    repoUrl: 'https://github.com/bitflicker64/Termstory',
    description:
      'Turns your terminal history into a searchable, AI-narrated timeline of your development life. ' +
      'Recover commands, correlate Git commits, and visualize your terminal work.',
    summary:
      'Turns your terminal history into a readable timeline, grouping commands into sessions ' +
      'and matching them up with the commits you made.',
    tags: ['Python', 'TUI', 'Shell-History', 'CLI'],
    author: { name: 'KAI', login: 'bitflicker64' },
  },
  {
    name: 'filedrop',
    tagline: 'File sharing',
    repoUrl: 'https://github.com/Dreamstick9/filedrop',
    description:
      'Instantly host encrypted files locally with QR codes for mobile transfer. ' +
      'Features AES-256-GCM browser encryption, ephemeral URLs, and DDoS protection.',
    summary:
      'Shares files across your local network, encrypted in the browser with AES-256-GCM, ' +
      'with a QR code so a phone can pick them up.',
    tags: ['JavaScript', 'Node.js', 'AES-256', 'Crypto'],
    author: { name: 'Dreamstick', login: 'Dreamstick9' },
  },
  {
    name: 'OSS Grid',
    tagline: 'Open-source mentorship',
    repoUrl: 'https://github.com/rajatrsrivastav/ossgrid',
    description:
      'Explore GSoC and LFX Mentorship organizations, past projects, mentors, and public proposals. ' +
      'Search and filter open-source opportunities without signing in.',
    summary:
      'Lets you browse GSoC and LFX Mentorship organisations, past projects and proposals, ' +
      'with search and filters and no sign-in.',
    tags: ['Next.js', 'TypeScript', 'Tailwind CSS', 'Fuse.js'],
    author: { name: 'Rajat Srivastav', login: 'rajatrsrivastav' },
  },
];

/**
 * GitHub serves any user's avatar at github.com/<login>.png, so cards never
 * need a hard-coded numeric avatar id.
 */
export function githubAvatarUrl(login: string, size = 64): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=${size}`;
}
