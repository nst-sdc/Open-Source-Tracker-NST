import type { StudentPR } from './github';
import type { RepoCacheMap } from './repo-cache';

/**
 * A highlight is a plain statement of fact about a contributor's merged work.
 *
 * Two rules shape this list. First, a highlight must say something the four
 * stat cards above it don't already say — repeating "136 merged" next to a card
 * reading "136 Merged" is wasted space. Second, it must actually vary between
 * people: the previous set (first merge / 10+ merged / bug fixes / docs / three
 * in a week) was earned in full by every single contributor in the top ten, so
 * it distinguished nobody. These carry the contributor's own numbers instead.
 */
export interface Badge {
  id: string;
  name: string;
  desc: string;
}

function repoOf(pr: StudentPR): string | null {
  return pr.repository_url ? pr.repository_url.replace('https://api.github.com/repos/', '') : null;
}

/** True when the title or any label mentions one of these words. */
function mentions(pr: StudentPR, words: string[]): boolean {
  const title = pr.title.toLowerCase();
  if (words.some((w) => title.includes(w))) return true;
  return pr.labels.some((l) => {
    const name = l.name.toLowerCase();
    return words.some((w) => name.includes(w));
  });
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}m`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function getBadges(prs: StudentPR[], repoCache: RepoCacheMap = {}): Badge[] {
  const merged = prs.filter((pr) => pr.pull_request?.merged_at);
  if (merged.length === 0) return [];

  const list: Badge[] = [];

  // Someone with only a handful of merges has nothing else worth measuring
  // yet — the milestone itself is the story.
  if (merged.length <= 5) {
    list.push({
      id: 'first_merge',
      name: merged.length === 1 ? 'First merge' : `${merged.length} merges so far`,
      desc:
        merged.length === 1
          ? 'Has had a first pull request accepted into a project they do not own — the hardest one to land.'
          : `Has had ${merged.length} pull requests accepted into projects they do not own.`,
    });
  }

  // How widely their work has been taken, which the stat cards never show.
  const projects = new Set<string>();
  for (const pr of merged) {
    const repo = repoOf(pr);
    if (repo) projects.add(repo);
  }
  if (projects.size >= 3) {
    list.push({
      id: 'projects',
      name: `${projects.size} projects`,
      desc: `Has had pull requests merged into ${projects.size} different projects.`,
    });
  }

  // Of the pull requests that actually got a decision, how many were kept.
  // Needs a real sample — a 2-for-2 record is not a 100% success rate.
  const turnedDown = prs.filter((pr) => !pr.pull_request?.merged_at && pr.state !== 'open');
  const decided = merged.length + turnedDown.length;
  if (decided >= 20) {
    const rate = Math.round((merged.length / decided) * 100);
    if (rate >= 75) {
      list.push({
        id: 'accepted',
        name: `${rate}% accepted`,
        desc: `Of the ${decided} pull requests that have been decided either way, ${rate}% were merged rather than turned down.`,
      });
    }
  }

  // Sustained work beats one busy fortnight, so count the months that contain
  // a merge rather than the length of the longest streak.
  const activeMonths = new Set<string>();
  for (const pr of merged) {
    const d = new Date(pr.pull_request.merged_at!);
    activeMonths.add(`${d.getFullYear()}-${d.getMonth()}`);
  }
  if (activeMonths.size >= 6) {
    list.push({
      id: 'months',
      name: `Active ${activeMonths.size} months`,
      desc: `Has merged work in ${activeMonths.size} separate months, so this is a sustained record rather than a single burst.`,
    });
  }

  // What kind of work they mostly do — only when one kind clearly dominates,
  // otherwise everybody qualifies for both and it means nothing.
  const bugShare = merged.filter((pr) => mentions(pr, ['fix', 'bug'])).length / merged.length;
  const docShare = merged.filter((pr) => mentions(pr, ['doc', 'readme'])).length / merged.length;
  if (bugShare >= 0.4 && bugShare >= docShare) {
    list.push({
      id: 'bugs',
      name: 'Mostly bug fixes',
      desc: `${Math.round(bugShare * 100)}% of their merged pull requests repaired something broken rather than adding something new.`,
    });
  } else if (docShare >= 0.35) {
    list.push({
      id: 'docs',
      name: 'Mostly documentation',
      desc: `${Math.round(docShare * 100)}% of their merged pull requests improved a project's written instructions.`,
    });
  }

  // The biggest room they have got into. Stars are a rough proxy for how many
  // people are watching a project, and landing anything in a large one is hard.
  let topRepo = '';
  let topStars = 0;
  for (const repo of projects) {
    const stars = repoCache[repo]?.stars ?? 0;
    if (stars > topStars) {
      topStars = stars;
      topRepo = repo;
    }
  }
  if (topStars >= 10_000) {
    list.push({
      id: 'reach',
      name: `${compactCount(topStars)}-star project`,
      desc: `Has had work merged into ${topRepo}, a project ${topStars.toLocaleString('en-US')} people have starred on GitHub.`,
    });
  }

  return list.slice(0, 5);
}
