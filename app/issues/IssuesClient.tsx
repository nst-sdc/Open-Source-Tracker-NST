'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

interface IssueStep {
  step: string;
  code: string;
  note?: string;
}

interface Issue {
  id: string;
  kind: string;
  title: string;
  tags: string[];
  whatHappened: string;
  whyItHappens: string[];
  solution: IssueStep[];
  preventionTip: string;
}

const KIND_STYLE: Record<string, { label: string; className: string }> = {
  common: {
    label: 'Common',
    className: 'bg-warning-0 border-warning-200 text-warning-600',
  },
  'best-practice': {
    label: 'Best practice',
    className: 'bg-brand-0 border-brand-100 text-brand-600',
  },
};

const NAV_OFFSET = 'scroll-mt-[76px]';

/* The address bar is the source of truth for a deep-linked issue. Reading it
   through an external store keeps the first client render in step with the
   server's (which has no hash) instead of racing a mount effect against the
   controlled `open` attribute. */
function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
const readHash = () => window.location.hash.slice(1);
const noHashOnServer = () => '';

/* The source copy marks commands with backticks; render those as real code
   spans instead of leaking the backticks into the page. */
function RichText({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="font-mono text-[0.92em] bg-panel-2 border border-line-strong rounded px-1 py-px text-ink-strong"
          >
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard blocked (insecure origin or denied) — leave the text selectable. */
    }
  }, [code]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied to clipboard' : 'Copy command to clipboard'}
      className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-ground px-2 py-1 text-xs font-medium text-ink-soft shadow-card hover:text-ink hover:border-line-heavy transition-colors"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-success-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* Comment lines carry the explanation, command lines carry the action — the two
   read very differently, so they should not share one flat grey. */
function CodeBlock({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <div className="relative group">
      <pre className="overflow-x-auto rounded-xl border border-line bg-panel px-4 py-3.5 pr-20 text-[12.5px] leading-[1.7] font-mono">
        <code>
          {lines.map((line, i) => (
            <span
              key={i}
              className={`block ${line.trimStart().startsWith('#') ? 'text-ink-soft' : 'text-ink-strong'}`}
            >
              {line || ' '}
            </span>
          ))}
        </code>
      </pre>
      <CopyButton code={code} />
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-5 h-5 flex-shrink-0 text-ink-soft transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function IssuesClient({ issues }: { issues: Issue[] }) {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('');
  // Explicit open/closed decisions. Anything absent falls back to the hash.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());

  const hashId = useSyncExternalStore(subscribeToHash, readHash, noHashOnServer);

  const allTags = useMemo(() => {
    const set = new Set(issues.flatMap((i) => i.tags));
    return [...set].sort();
  }, [issues]);

  const query = search.toLowerCase().trim();

  const matches = useCallback((issue: Issue, q: string, tag: string) => {
    const matchesQuery =
      !q ||
      [
        issue.title,
        issue.whatHappened,
        issue.preventionTip,
        ...issue.tags,
        ...issue.whyItHappens,
        ...issue.solution.flatMap((s) => [s.step, s.code, s.note ?? '']),
      ].some((field) => field.toLowerCase().includes(q));
    return matchesQuery && (!tag || issue.tags.includes(tag));
  }, []);

  const filtered = useMemo(
    () => issues.filter((issue) => matches(issue, query, activeTag)),
    [issues, query, activeTag, matches],
  );

  const isOpen = useCallback(
    (id: string) => overrides.get(id) ?? hashId === id,
    [overrides, hashId],
  );

  // A search is someone hunting for an answer, so hand them the answer rather
  // than a list of things still to click. Clearing the box collapses again.
  const onSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      const q = value.toLowerCase().trim();
      setOverrides(
        q
          ? new Map(issues.map((i) => [i.id, matches(i, q, activeTag)]))
          : new Map(),
      );
    },
    [issues, activeTag, matches],
  );

  // <details> reports its own state; mirror it without looping on no-op events.
  // The updater stays pure — a history call in here would run during render and
  // update the Next router mid-render.
  const syncOpen = useCallback((id: string, nowOpen: boolean) => {
    setOverrides((prev) => {
      if (prev.get(id) === nowOpen) return prev;
      const next = new Map(prev);
      next.set(id, nowOpen);
      return next;
    });
  }, []);

  // Only a real click rewrites the address bar, so an opened issue is a
  // shareable link while "expand all" and search stay out of it.
  const rememberInUrl = useCallback((id: string, wasOpen: boolean) => {
    if (wasOpen) {
      if (window.location.hash.slice(1) === id) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } else {
      history.replaceState(null, '', `#${id}`);
    }
  }, []);

  // The browser only scrolls to a fragment it can see; a deep-linked issue is
  // opened by this component, so bring it into view once that has happened.
  useEffect(() => {
    if (!hashId) return;
    document.getElementById(hashId)?.scrollIntoView({ block: 'start' });
  }, [hashId]);

  const allExpanded = filtered.length > 0 && filtered.every((i) => isOpen(i.id));

  const toggleAll = useCallback(() => {
    setOverrides(new Map(filtered.map((i) => [i.id, !allExpanded])));
  }, [allExpanded, filtered]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setActiveTag('');
    setOverrides(new Map());
  }, []);

  const filtering = Boolean(query || activeTag);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-8 pb-24">
      {/* Search */}
      <label htmlFor="issues-search" className="sr-only">
        Search issues
      </label>
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id="issues-search"
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search issues, commands, or error text"
          className="w-full rounded-xl border border-line-strong bg-ground py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink-soft shadow-card focus:border-brand-400 focus:outline-none transition-colors [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-md text-ink-soft hover:bg-panel-2 hover:text-ink-mid transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tag filters */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTag('')}
          aria-pressed={!activeTag}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            !activeTag
              ? 'border-ink bg-ink text-white'
              : 'border-line-strong bg-ground text-ink-soft hover:border-line-heavy hover:text-ink'
          }`}
        >
          All
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
            aria-pressed={activeTag === tag}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTag === tag
                ? 'border-ink bg-ink text-white'
                : 'border-line-strong bg-ground text-ink-soft hover:border-line-heavy hover:text-ink'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Result count + expand-all */}
      <div className="mt-5 flex items-center justify-between gap-4 border-b border-line pb-3">
        <p className="text-sm text-ink-soft" aria-live="polite">
          {filtering
            ? `${filtered.length} of ${issues.length} ${filtered.length === 1 ? 'issue' : 'issues'}`
            : `${issues.length} issues`}
        </p>
        {filtered.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      {/* Issues */}
      <div className="mt-4 space-y-3">
        {filtered.map((issue) => {
          const kind = KIND_STYLE[issue.kind] ?? KIND_STYLE.common;
          const open = isOpen(issue.id);
          return (
            <details
              key={issue.id}
              id={issue.id}
              open={open}
              onToggle={(e) => syncOpen(issue.id, e.currentTarget.open)}
              className={`overflow-hidden rounded-2xl border bg-ground transition-shadow ${NAV_OFFSET} ${
                open ? 'border-line-strong shadow-card' : 'border-line hover:border-line-strong'
              }`}
            >
              <summary
                onClick={() => rememberInUrl(issue.id, open)}
                className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${kind.className}`}>
                      {kind.label}
                    </span>
                    {issue.tags.map((tag) => (
                      <span key={tag} className="text-[11px] text-ink-soft">
                        {tag}
                      </span>
                    ))}
                  </span>
                  <h2 className="mt-1.5 text-[15px] font-[600] leading-snug text-ink">
                    {issue.title}
                  </h2>
                </span>
                <span className="pt-1">
                  <Chevron open={open} />
                </span>
              </summary>

              <div className="border-t border-line px-5 py-5 space-y-6">
                <p className="text-[15px] leading-relaxed text-ink-mid">
                  <RichText text={issue.whatHappened} />
                </p>

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    Why it happens
                  </h3>
                  <ul className="mt-2.5 space-y-2 border-l-2 border-warning-200 pl-4">
                    {issue.whyItHappens.map((reason, i) => (
                      <li key={i} className="text-sm leading-relaxed text-ink-mid">
                        <RichText text={reason} />
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    How to fix it
                  </h3>
                  <ol className="mt-3 space-y-5">
                    {issue.solution.map((s, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-success-0 text-xs font-semibold text-success-600">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-sm font-[600] leading-snug text-ink">
                            <RichText text={s.step} />
                          </p>
                          <CodeBlock code={s.code} />
                          {s.note && (
                            <p className="text-[13px] leading-relaxed text-ink-soft">
                              <RichText text={s.note} />
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-xl border border-line bg-panel px-4 py-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    Avoid it next time
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-mid">
                    <RichText text={issue.preventionTip} />
                  </p>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-line bg-ground px-6 py-14 text-center">
          <p className="font-[600] text-ink">No issues matched</p>
          <p className="mt-1 text-sm text-ink-soft">
            Try a different term, or clear the filters to see all {issues.length}.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-4 rounded-lg border border-line-strong bg-ground px-3.5 py-2 text-sm font-medium text-ink-mid hover:border-line-heavy hover:text-ink transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Nothing here? */}
      <section className="mt-10 rounded-2xl border border-line bg-ground px-6 py-7">
        <h2 className="text-[15px] font-[650] text-ink">Hit something that is not listed?</h2>
        <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-soft">
          Open an issue on the tracker repo so the fix gets written down for the
          next person who runs into it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <a
            href="https://github.com/nst-sdc/Open-Source-Tracker-NST/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-brand-btn hover:bg-brand-700 transition-colors"
          >
            Open an issue
          </a>
          <Link
            href="/get-started"
            className="rounded-lg border border-line-strong bg-ground px-3.5 py-2 text-sm font-medium text-ink-mid hover:border-line-heavy hover:text-ink transition-colors"
          >
            Read the Get Started guide
          </Link>
        </div>
      </section>
    </div>
  );
}
