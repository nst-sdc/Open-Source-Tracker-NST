/**
 * lib/org-languages-shared.ts
 *
 * Client-safe part of the organisation language profiles: what GitHub says
 * an organisation's repositories are written in, measured in bytes across
 * its most-starred public repositories (lib/org-languages.ts collects it).
 * The explorer's language filter and "language share" sort run on this,
 * never on what an organisation says about itself.
 */

/** One organisation's languages as served to the page: name, share of
 *  bytes (0–100, one decimal), and how many sampled repositories use it. */
export type LanguageShare = [name: string, percent: number, repos: number];

export interface OrgLanguageProfile {
  /** Sampled repositories (the most-starred public, non-fork ones). */
  repos: number;
  /** Repositories the organisation has in total. */
  totalRepos: number;
  /** Most bytes first. */
  languages: LanguageShare[];
}

export type OrgLanguageMap = Record<string, OrgLanguageProfile>;

/** Below this share of an organisation's bytes a language is noise (build
 *  scripts, a notebook or two) and does not make the organisation "use" it. */
export const LANGUAGE_MIN_SHARE = 1;

/** Languages a beginner is likely to know, as GitHub names them. */
export const LANGUAGE_QUICK_PICKS: ReadonlyArray<string> = ['Python', 'JavaScript', 'TypeScript', 'C++', 'C', 'Java', 'Go', 'Rust', 'Kotlin', 'Dart', 'Ruby', 'PHP'];

/** GitHub's linguist colours for the common languages; grey for the rest. */
export const LANGUAGE_COLORS: Record<string, string> = {
  Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', 'C++': '#f34b7d', C: '#555555', Java: '#b07219', Go: '#00ADD8', Rust: '#dea584',
  Kotlin: '#A97BFF', Dart: '#00B4AB', Ruby: '#701516', PHP: '#4F5D95', 'C#': '#178600', Swift: '#F05138', Scala: '#c22d40', Shell: '#89e051', HTML: '#e34c26',
  CSS: '#663399', SCSS: '#c6538c', Vue: '#41b883', Svelte: '#ff3e00', 'Jupyter Notebook': '#DA5B0B', R: '#198CE7', Julia: '#a270ba', Haskell: '#5e5086',
  OCaml: '#ef7a08', Elixir: '#6e4a7e', Erlang: '#B83998', Lua: '#000080', Perl: '#0298c3', 'Objective-C': '#438eff', CMake: '#DA3434', Makefile: '#427819',
  Dockerfile: '#384d54', Fortran: '#4d41b1', Assembly: '#6E4C13', Zig: '#ec915c', Nim: '#ffc200', Clojure: '#db5855', 'Emacs Lisp': '#c065db', Groovy: '#4298b8',
  'Common Lisp': '#3fb68b', Solidity: '#AA6746', GLSL: '#5686a5', Cuda: '#3A4E3A', MATLAB: '#e16737', TeX: '#3D6117', Vala: '#a56de2', QML: '#44a51c', Verilog: '#b2b7f8', SystemVerilog: '#DAE1C2', VHDL: '#adb2cb',
};

export function languageColor(name: string): string {
  return LANGUAGE_COLORS[name] ?? '#8c95a6';
}

/** Share of the given language in an organisation, 0 when absent or below the floor. */
export function shareOf(profile: OrgLanguageProfile | undefined, language: string): number {
  const hit = profile?.languages.find((l) => l[0].toLowerCase() === language.toLowerCase());
  return hit && hit[1] >= LANGUAGE_MIN_SHARE ? hit[1] : 0;
}

/** Combined share of several languages (for sorting by a multi-language pick). */
export function combinedShare(profile: OrgLanguageProfile | undefined, languages: ReadonlyArray<string>): number {
  return languages.reduce((sum, l) => sum + shareOf(profile, l), 0);
}

/** Bytes per language across sampled repositories → shares, most bytes first. */
export function aggregateLanguageBytes(
  repos: ReadonlyArray<{ languages: ReadonlyArray<{ name: string; size: number }> }>,
  totalRepos: number,
  keep = 15,
): OrgLanguageProfile {
  const bytes = new Map<string, number>();
  const withLang = new Map<string, number>();
  let total = 0;
  for (const r of repos) {
    for (const l of r.languages) {
      if (!l.size) continue;
      bytes.set(l.name, (bytes.get(l.name) ?? 0) + l.size);
      withLang.set(l.name, (withLang.get(l.name) ?? 0) + 1);
      total += l.size;
    }
  }
  const languages: LanguageShare[] = [...bytes]
    .sort((a, b) => b[1] - a[1])
    .slice(0, keep)
    .map(([name, b]) => [name, total ? Math.round((b / total) * 1000) / 10 : 0, withLang.get(name) ?? 0]);
  return { repos: repos.length, totalRepos, languages };
}
