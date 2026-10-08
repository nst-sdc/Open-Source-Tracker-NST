import { getAchieversKV } from './kv-achievers';
import type { Recognition, RecognitionKind, RecognitionMap, RecognitionItem } from './recognition-types';
export type { RecognitionKind, Recognition, RecognitionMap, RecognitionItem };
export { KIND_LABEL } from './recognition-types';

function add(into: RecognitionMap, login: string, item: RecognitionItem) {
  const key = login.toLowerCase();
  const entry = (into[key] ??= { kinds: [], items: [] });
  if (!entry.kinds.includes(item.kind)) entry.kinds.push(item.kind);
  if (item.label && !entry.items.some((i) => i.label === item.label)) entry.items.push(item);
}

export async function getRecognitions(): Promise<RecognitionMap> {
  const achievers = await getAchieversKV();
  const map: RecognitionMap = {};

  for (const person of achievers) {
    for (const p of person.programs ?? []) {
      const kind: RecognitionKind =
        p.kind === 'conference' ? 'conference' : p.kind === 'project' ? 'project' : 'program';
      const label = [p.name, p.org, p.year].filter(Boolean).join(' · ') || p.name;
      add(map, person.github, { label, kind, url: p.url?.trim() || undefined });
    }
  }

  return map;
}

export function recognitionFor(map: RecognitionMap, login: string): Recognition | undefined {
  return map[login.toLowerCase()];
}
