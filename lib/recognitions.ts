import { getAchieversKV } from './kv-achievers';
import type { Recognition, RecognitionKind, RecognitionMap, RecognitionItem } from './recognition-types';
export type { RecognitionKind, Recognition, RecognitionMap, RecognitionItem };
export { KIND_LABEL } from './recognition-types';

/**
 * The star beside a rank: recognition the leaderboard's own score cannot give.
 *
 * Ranking counts merged PRs into other people's repositories, which says
 * nothing about a student who got into GSoC, spoke at a conference, or
 * maintains a project of their own. Those are exactly what the Hall of Fame
 * already records, so it is the single source here -- one list to curate, and
 * a star on the board is always explainable by an entry someone added
 * deliberately.
 *
 * Program.kind distinguishes the three. It is optional and defaults to
 * 'program', so entries written before conferences and projects existed keep
 * meaning what they meant.
 */
function add(into: RecognitionMap, login: string, item: RecognitionItem) {
  const key = login.toLowerCase();
  const entry = (into[key] ??= { kinds: [], items: [] });
  if (!entry.kinds.includes(item.kind)) entry.kinds.push(item.kind);
  if (item.label && !entry.items.some((i) => i.label === item.label)) entry.items.push(item);
}

/** One KV read for the whole board, however many students are recognised. */
export async function getRecognitions(): Promise<RecognitionMap> {
  const achievers = await getAchieversKV();
  const map: RecognitionMap = {};

  for (const person of achievers) {
    for (const p of person.programs ?? []) {
      const kind: RecognitionKind =
        p.kind === 'conference' ? 'conference' : p.kind === 'project' ? 'project' : 'program';
      const label = [p.name, p.org, p.year].filter(Boolean).join(' · ') || p.name;
      // url is optional on Program and is empty on most entries today; the
      // profile links the chip only when there is something to link to.
      add(map, person.github, { label, kind, url: p.url?.trim() || undefined });
    }
  }

  return map;
}

export function recognitionFor(map: RecognitionMap, login: string): Recognition | undefined {
  return map[login.toLowerCase()];
}
