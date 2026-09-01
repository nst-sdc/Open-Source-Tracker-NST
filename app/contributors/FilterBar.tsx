'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';

const PRESETS = [
  { label: 'All time',  value: 'all'     },
  { label: '24 hours',  value: '1day'    },
  { label: 'This week', value: 'week'    },
  { label: 'This month', value: 'month'  },
  { label: '2 months',  value: '2months' },
  { label: '3 months',  value: '3months' },
];

const YEARS = ['1st year', '2nd year', '3rd year', '4th year'] as const;
const CAMPUSES = ['ADYPU', 'Rishihood', 'SVYASA'] as const;

function Spinner({ className = 'text-brand-500' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = searchParams.get('period') ?? 'all';
  const searchQuery = searchParams.get('search') ?? '';
  const yearParam = searchParams.get('year') ?? '';
  const campusParam = searchParams.get('campus') ?? '';

  const [showCustom, setShowCustom] = useState(period === 'custom');
  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [to, setTo]     = useState(searchParams.get('to')   ?? '');
  const [search, setSearch] = useState(searchQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search values this component has itself written into the URL. A navigation
  // carrying one of these is the echo of our own debounced update, not a fresh
  // instruction from outside — and it can land seconds late, because the page
  // it navigates to re-queries every student. Adopting it would overwrite
  // whatever has been typed in the meantime.
  const [selfPushedSearches, setSelfPushedSearches] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const [loadingTarget, setLoadingTarget] = useState<string | null>(null);

  // Clear the loading state once the URL actually changes. Compared during
  // render rather than in an effect, matching how period and search are handled
  // below, so a URL change costs one render instead of two.
  const paramsKey = searchParams.toString();
  const [prevParamsKey, setPrevParamsKey] = useState(paramsKey);
  if (paramsKey !== prevParamsKey) {
    setPrevParamsKey(paramsKey);
    setLoadingTarget(null);
  }

  // Never leave a debounced navigation queued after unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const [prevPeriod, setPrevPeriod] = useState(period);
  if (period !== prevPeriod) {
    setPrevPeriod(period);
    if (period !== 'custom') setShowCustom(false);
  }

  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    if (selfPushedSearches.has(searchQuery)) {
      // Our own echo. Consume it, so that genuinely navigating back to this
      // value later is still honoured, and leave the typed text alone.
      const remaining = new Set(selfPushedSearches);
      remaining.delete(searchQuery);
      setSelfPushedSearches(remaining);
    } else {
      // A real external change: back/forward, or a link that sets the query.
      setSearch(searchQuery);
    }
  }

  function buildParams(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const cur = {
      period,
      from: searchParams.get('from') ?? '',
      to: searchParams.get('to') ?? '',
      search,
      year: yearParam,
      campus: campusParam,
    };
    const merged = { ...cur, ...overrides };
    if (merged.period && merged.period !== 'all') p.set('period', merged.period);
    if (merged.from) p.set('from', merged.from);
    if (merged.to) p.set('to', merged.to);
    if (merged.search) p.set('search', merged.search);
    if (merged.year) p.set('year', merged.year);
    if (merged.campus) p.set('campus', merged.campus);
    return p.toString();
  }

  function pushWithRefresh(url: string, targetValue?: string, mode: 'push' | 'replace' = 'push') {
    if (targetValue) setLoadingTarget(targetValue);
    // Recorded here rather than in each caller so no navigation can bypass it.
    const outgoing = new URLSearchParams(url.split('?')[1] ?? '').get('search') ?? '';
    setSelfPushedSearches((prev) => new Set(prev).add(outgoing));
    if (mode === 'replace') router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
    setTimeout(() => {
      router.refresh();
    }, 20);
  }

  function navigate(value: string) {
    if (value === 'custom') { setShowCustom(true); return; }
    setShowCustom(false);
    const qs = buildParams({ period: value, from: '', to: '' });
    pushWithRefresh(qs ? `/contributors?${qs}` : '/contributors', value);
  }

  function applyCustom() {
    if (!from) return;
    const p = new URLSearchParams({ period: 'custom', from });
    if (to) p.set('to', to);
    if (search) p.set('search', search);
    if (yearParam) p.set('year', yearParam);
    if (campusParam) p.set('campus', campusParam);
    pushWithRefresh(`/contributors?${p.toString()}`, 'custom-apply');
    setShowCustom(false);
  }

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const qs = buildParams({ search: value });
      // replace, not push: typing a nine-character name would otherwise leave
      // several entries in history for Back to walk through one at a time.
      pushWithRefresh(qs ? `/contributors?${qs}` : '/contributors', 'search', 'replace');
    }, 350);
  }

  function handleYearChange(value: string) {
    const qs = buildParams({ year: value });
    pushWithRefresh(qs ? `/contributors?${qs}` : '/contributors', 'year');
  }

  function handleCampusChange(value: string) {
    const qs = buildParams({ campus: value });
    pushWithRefresh(qs ? `/contributors?${qs}` : '/contributors', 'campus');
  }

  const isCustomActive = period === 'custom';
  const isPending = loadingTarget !== null;

  const hasActiveFilters = period !== 'all' || search || yearParam || campusParam;

  const selectClass = (active: boolean) =>
    `appearance-none cursor-pointer h-10 pl-4 pr-9 rounded-[11px] text-[13.5px] font-[500] transition-colors border focus:outline-none focus-visible:outline-2 ${
      active
        ? 'bg-brand-0 border-brand-100 text-brand-600 font-[550]'
        : 'bg-white border-line-strong text-ink-mid hover:border-line-heavy'
    }`;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
      <div className="bg-white border border-line rounded-2xl shadow-card p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:flex-wrap">
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or GitHub username…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full h-10 bg-white border border-line-strong text-ink placeholder:text-ink-soft text-[13.5px] rounded-[11px] pl-10 pr-9 focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-0 transition-colors"
            />
            {search && (
              <button
                onClick={() => handleSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Year filter */}
          <div className="relative">
            <select
              value={yearParam}
              onChange={(e) => handleYearChange(e.target.value)}
              className={selectClass(!!yearParam)}
            >
              <option value="">All years</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Campus filter */}
          <div className="relative">
            <select
              value={campusParam}
              onChange={(e) => handleCampusChange(e.target.value)}
              className={selectClass(!!campusParam)}
            >
              <option value="">All campuses</option>
              {CAMPUSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Preset pills */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(({ label, value }) => {
            const active = period === value;
            const isLoading = isPending && loadingTarget === value;
            return (
              <button
                key={value}
                onClick={() => navigate(value)}
                disabled={isPending}
                className={`relative h-9 px-4 rounded-full text-[13px] transition-colors border ${
                  active
                    ? 'bg-brand-500 border-brand-500 text-white font-[550]'
                    : 'bg-white border-line-strong text-ink-mid font-[450] hover:border-line-heavy hover:text-ink'
                } ${isPending && !isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={isLoading ? 'opacity-0' : 'opacity-100 transition-opacity'}>{label}</span>
                {isLoading && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Spinner className={active ? 'text-white' : 'text-brand-500'} />
                  </span>
                )}
              </button>
            );
          })}

          {/* Custom pill */}
          <button
            onClick={() => navigate('custom')}
            disabled={isPending}
            className={`relative h-9 px-4 rounded-full text-[13px] transition-colors border ${
              isCustomActive || showCustom
                ? 'bg-brand-500 border-brand-500 text-white font-[550]'
                : 'bg-white border-line-strong text-ink-mid font-[450] hover:border-line-heavy hover:text-ink'
            } ${isPending && loadingTarget !== 'custom' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={isPending && loadingTarget === 'custom' ? 'opacity-0' : 'opacity-100 transition-opacity'}>Custom</span>
            {isPending && loadingTarget === 'custom' && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Spinner className={isCustomActive || showCustom ? 'text-white' : 'text-brand-500'} />
              </span>
            )}
          </button>
        </div>

        {/* Custom date inputs */}
        {showCustom && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-panel">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              disabled={isPending}
              className="h-10 bg-white border border-line-strong text-ink text-[13.5px] rounded-[11px] px-3 focus:outline-none focus:border-brand-300 disabled:opacity-50"
            />
            <span className="text-ink-soft text-sm">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from}
              disabled={isPending}
              className="h-10 bg-white border border-line-strong text-ink text-[13.5px] rounded-[11px] px-3 focus:outline-none focus:border-brand-300 disabled:opacity-50"
            />
            <button
              onClick={applyCustom}
              disabled={!from || isPending}
              className="relative h-10 px-5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13.5px] font-[550] rounded-[11px] transition-colors"
            >
              <span className={isPending && loadingTarget === 'custom-apply' ? 'opacity-0' : 'opacity-100 transition-opacity'}>Apply</span>
              {isPending && loadingTarget === 'custom-apply' && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Spinner className="text-white" />
                </span>
              )}
            </button>
            <button
              onClick={() => setShowCustom(false)}
              disabled={isPending}
              className="text-ink-soft hover:text-ink text-[13.5px] font-[500] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Active filter labels */}
        {hasActiveFilters && (
          <p className="text-ink-soft text-xs flex flex-wrap gap-x-2 items-center pt-1 border-t border-panel">
            {period !== 'all' && (
              <span>
                {period === 'custom'
                  ? `Contributions from ${from}${to ? ` to ${to}` : ' onwards'}`
                  : `Last ${
                      period === '1day' ? '24 hours' :
                      period === 'week' ? '7 days' :
                      period === 'month' ? '30 days' :
                      period === '2months' ? '2 months' :
                      '3 months'
                    }`
                }
              </span>
            )}
            {yearParam && (
              <>
                {period !== 'all' && <span className="text-line-heavy">·</span>}
                <span className="text-brand-600 font-[550]">{yearParam}</span>
              </>
            )}
            {campusParam && (
              <>
                {(period !== 'all' || yearParam) && <span className="text-line-heavy">·</span>}
                <span className="text-brand-600 font-[550]">{campusParam}</span>
              </>
            )}
            {search && (
              <>
                {(period !== 'all' || yearParam || campusParam) && <span className="text-line-heavy">·</span>}
                <span>Searching &ldquo;{search}&rdquo;</span>
              </>
            )}
            <span className="text-line-heavy">·</span>
            <button
              onClick={() => { setSearch(''); router.push('/contributors', { scroll: false }); }}
              className="underline underline-offset-2 hover:text-ink transition-colors"
            >
              Clear all
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
