import { githubAvatarUrl, type CommunityProject } from '@/lib/community-projects';

/**
 * One featured community project, in the visual style of whichever page is
 * showing it. The three variants are the three pre-existing card designs,
 * kept as they were so this refactor changes no pixels — only where the
 * data lives (lib/community-projects.ts).
 *
 *  - `home`      — compact card for the home page's "Built by our community" grid
 *  - `achievers` — larger card for /achievers' "Featured Student Maintainers"
 *  - `spotlight` — minimal card for /get-started's "Student spotlight"
 */
type Props = {
  project: CommunityProject;
  variant: 'home' | 'achievers' | 'spotlight';
  /** Decorative accent on the achievers variant, alternated by the caller. */
  accent?: 'brand' | 'violet';
};

export function CommunityProjectCard({ project, variant, accent = 'brand' }: Props) {
  const { name, tagline, repoUrl, description, summary, tags, author } = project;
  const linkProps = { href: repoUrl, target: '_blank', rel: 'noopener noreferrer' } as const;

  if (variant === 'spotlight') {
    return (
      <a {...linkProps} className="group rounded-2xl border border-line bg-ground p-5 card-hover">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-[650] text-ink group-hover:text-brand-600 transition-colors">{name}</h3>
          <span className="text-[11px] text-ink-soft">@{author.login}</span>
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-mid">{summary}</p>
        <span className="mt-4 inline-block text-[13px] font-medium text-brand-600">View on GitHub →</span>
      </a>
    );
  }

  if (variant === 'achievers') {
    const hoverBorder = accent === 'violet' ? 'hover:border-violet-100' : 'hover:border-brand-100';
    const arrow = accent === 'violet' ? 'text-violet-600' : 'text-brand-600';
    return (
      <a
        {...linkProps}
        className={`group flex flex-col justify-between p-6 rounded-2xl bg-ground border border-line hover:bg-panel ${hoverBorder} hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 relative overflow-hidden`}
      >
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div>
              <h3 className="font-[650] text-ink text-base group-hover:text-ink transition-colors">{name}</h3>
              <span className="text-[10px] text-ink-soft font-mono uppercase tracking-wider">{tagline}</span>
            </div>
          </div>
          <p className="text-ink-mid text-xs leading-relaxed mb-4">{description}</p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {tags.map((t) => (
              <span key={t} className="text-[10px] px-2.5 py-0.5 rounded bg-panel border border-line text-ink-soft font-mono">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="pt-4 border-t border-line flex items-center justify-between text-xs text-ink-soft">
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={githubAvatarUrl(author.login)} alt={author.login} className="w-5 h-5 rounded-full border border-line" />
            Built by <strong className="text-ink-mid">{author.name} (@{author.login})</strong>
          </span>
          <span className={`${arrow} group-hover:translate-x-0.5 transition-transform`}>→</span>
        </div>
      </a>
    );
  }

  // variant === 'home'
  return (
    <a
      {...linkProps}
      className="group flex flex-col justify-between p-5 rounded-2xl bg-ground border border-line shadow-card card-hover"
    >
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div>
            <h3 className="font-[650] text-ink text-sm">{name}</h3>
            <span className="text-[10.5px] text-ink-soft font-[550] tracking-[0.06em] uppercase">{tagline}</span>
          </div>
        </div>
        <p className="text-ink-soft text-[12.5px] leading-relaxed mb-4">{description}</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.map((t) => (
            <span key={t} className="text-[10.5px] font-[550] px-2 py-0.5 rounded-md bg-panel text-ink-mid">
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="pt-3 border-t border-panel flex items-center justify-between text-[11px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={githubAvatarUrl(author.login)} alt={author.login} className="w-4 h-4 rounded-full" />
          Built by <strong className="text-ink-mid font-[600]">{author.name} (@{author.login})</strong>
        </span>
        <span className="text-brand-600 group-hover:translate-x-0.5 transition-transform">→</span>
      </div>
    </a>
  );
}
