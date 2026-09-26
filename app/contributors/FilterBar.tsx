"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";

export interface FilterBarOrgContext {
  name: string;
  login: string;
  avatarUrl?: string;
  contributorsCount: number;
  mergedPRs: number;
}

interface OrgSuggestionItem {
  login: string;
  name?: string;
  avatarUrl?: string;
  contributorsCount: number;
  mergedPRs: number;
}

interface ContributorSuggestionItem {
  login: string;
  name?: string;
  avatarUrl?: string;
  campus?: string;
  year?: string;
  mergedPRs: number;
}

interface SuggestionsState {
  organizations: OrgSuggestionItem[];
  contributors: ContributorSuggestionItem[];
}

const PRESETS = [
  { label: "All time", value: "all" },
  { label: "24 hours", value: "1day" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
  { label: "2 months", value: "2months" },
  { label: "3 months", value: "3months" },
];

const YEARS = ["1st year", "2nd year", "3rd year", "4th year"] as const;
const CAMPUSES = ["ADYPU", "Rishihood", "SVYASA"] as const;

function Spinner({ className = "text-brand-500" }: { className?: string }) {
  return (
    <svg
      className={`w-4 h-4 animate-spin ${className}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

export function FilterBar({
  orgContext,
}: {
  orgContext?: FilterBarOrgContext;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = searchParams.get("period") ?? "all";
  const searchQuery = searchParams.get("search") ?? "";
  const orgParam = searchParams.get("org") ?? "";
  const yearParam = searchParams.get("year") ?? "";
  const campusParam = searchParams.get("campus") ?? "";

  const [showCustom, setShowCustom] = useState(period === "custom");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");
  const [search, setSearch] = useState(searchQuery);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<SuggestionsState>({
    organizations: [],
    contributors: [],
  });
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Search values this component has itself written into the URL.
  const [selfPushedSearches, setSelfPushedSearches] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const [loadingTarget, setLoadingTarget] = useState<string | null>(null);

  const paramsKey = searchParams.toString();
  const [prevParamsKey, setPrevParamsKey] = useState(paramsKey);
  if (paramsKey !== prevParamsKey) {
    setPrevParamsKey(paramsKey);
    setLoadingTarget(null);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suggestionsDebounceRef.current) clearTimeout(suggestionsDebounceRef.current);
    };
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [prevPeriod, setPrevPeriod] = useState(period);
  if (period !== prevPeriod) {
    setPrevPeriod(period);
    if (period !== "custom") setShowCustom(false);
  }

  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    if (selfPushedSearches.has(searchQuery)) {
      const remaining = new Set(selfPushedSearches);
      remaining.delete(searchQuery);
      setSelfPushedSearches(remaining);
    } else {
      setSearch(searchQuery);
    }
  }

  function buildParams(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const cur = {
      period,
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
      search,
      org: orgParam,
      year: yearParam,
      campus: campusParam,
    };
    const merged = { ...cur, ...overrides };
    if (merged.period && merged.period !== "all")
      p.set("period", merged.period);
    if (merged.from) p.set("from", merged.from);
    if (merged.to) p.set("to", merged.to);
    if (merged.org) p.set("org", merged.org);
    if (merged.search) p.set("search", merged.search);
    if (merged.year) p.set("year", merged.year);
    if (merged.campus) p.set("campus", merged.campus);
    return p.toString();
  }

  function pushWithRefresh(
    url: string,
    targetValue?: string,
    mode: "push" | "replace" = "push",
  ) {
    if (targetValue) setLoadingTarget(targetValue);
    const outgoing =
      new URLSearchParams(url.split("?")[1] ?? "").get("search") ?? "";
    setSelfPushedSearches((prev) => new Set(prev).add(outgoing));
    if (mode === "replace") router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
    setTimeout(() => {
      router.refresh();
    }, 20);
  }

  function navigate(value: string) {
    if (value === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    setFrom("");
    setTo("");
    const qs = buildParams({ period: value, from: "", to: "" });
    pushWithRefresh(qs ? `/contributors?${qs}` : "/contributors", value);
  }

  const fetchSuggestions = useCallback((query: string) => {
    const trimmed = query.trim().replace(/^@/, "");
    if (!trimmed) {
      setSuggestions({ organizations: [], contributors: [] });
      setIsSuggestionsOpen(false);
      return;
    }

    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
    }

    suggestionsDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(trimmed)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setIsSuggestionsOpen(
            (data.organizations?.length > 0 || data.contributors?.length > 0),
          );
          setSelectedIndex(-1);
        }
      } catch (err) {
        console.error("Failed to fetch suggestions:", err);
      }
    }, 150);
  }, []);

  function handleSearchInput(value: string) {
    setSearch(value);
    fetchSuggestions(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Normal typing updates contributor search and does NOT activate organization mode
      const qs = buildParams({ search: value, org: "" });
      pushWithRefresh(
        qs ? `/contributors?${qs}` : "/contributors",
        undefined,
        "replace",
      );
    }, 300);
  }

  function handleSelectOrg(org: OrgSuggestionItem) {
    setIsSuggestionsOpen(false);
    setSearch("");
    const qs = buildParams({ org: org.login, search: "" });
    pushWithRefresh(
      qs ? `/contributors?${qs}` : "/contributors",
      "org-select",
    );
  }

  function handleSelectContributor(contrib: ContributorSuggestionItem) {
    setIsSuggestionsOpen(false);
    router.push(`/contributors/${contrib.login}`);
  }

  // Calculate flat items list for keyboard navigation
  const flatSuggestions: Array<
    | { type: "org"; item: OrgSuggestionItem }
    | { type: "contributor"; item: ContributorSuggestionItem }
  > = [
    ...suggestions.organizations.map((item) => ({ type: "org" as const, item })),
    ...suggestions.contributors.map((item) => ({
      type: "contributor" as const,
      item,
    })),
  ];

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isSuggestionsOpen || flatSuggestions.length === 0) {
      if (e.key === "Enter") {
        setIsSuggestionsOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < flatSuggestions.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : flatSuggestions.length - 1,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < flatSuggestions.length) {
        const selected = flatSuggestions[selectedIndex];
        if (selected.type === "org") {
          handleSelectOrg(selected.item);
        } else {
          handleSelectContributor(selected.item);
        }
      } else {
        setIsSuggestionsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsSuggestionsOpen(false);
    }
  }

  function handleCustomApply() {
    if (!from) return;
    const qs = buildParams({ period: "custom", from, to });
    pushWithRefresh(
      qs ? `/contributors?${qs}` : "/contributors",
      "custom-apply",
    );
  }

  function handleYearChange(value: string) {
    const qs = buildParams({ year: value });
    pushWithRefresh(qs ? `/contributors?${qs}` : "/contributors", "year");
  }

  function handleCampusChange(value: string) {
    const qs = buildParams({ campus: value });
    pushWithRefresh(qs ? `/contributors?${qs}` : "/contributors", "campus");
  }

  const isCustomActive = period === "custom";
  const isPending = loadingTarget !== null;

  const hasActiveFilters =
    period !== "all" || search || orgParam || yearParam || campusParam;

  const selectClass = (active: boolean) =>
    `appearance-none cursor-pointer h-10 pl-4 pr-9 rounded-[11px] text-[13.5px] font-[500] transition-colors border focus:outline-none focus-visible:outline-2 ${
      active
        ? "bg-brand-0 border-brand-100 text-brand-600 font-[550]"
        : "bg-ground border-line-strong text-ink-mid hover:border-line-heavy"
    }`;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 mt-6">
      <div className="bg-ground border border-line rounded-2xl shadow-card p-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:flex-wrap">
          {/* Search input with Autocomplete */}
          <div ref={searchContainerRef} className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by name, username, or organization…"
              value={search}
              onChange={(e) => handleSearchInput(e.target.value)}
              onFocus={() => {
                if (
                  search.trim() &&
                  (suggestions.organizations.length > 0 ||
                    suggestions.contributors.length > 0)
                ) {
                  setIsSuggestionsOpen(true);
                }
              }}
              onKeyDown={handleKeyDown}
              className="w-full h-10 bg-ground border border-line-strong text-ink placeholder:text-ink-soft text-[13.5px] rounded-[11px] pl-10 pr-9 focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-0 transition-colors"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setIsSuggestionsOpen(false);
                  const qs = buildParams({ search: "" });
                  pushWithRefresh(
                    qs ? `/contributors?${qs}` : "/contributors",
                    undefined,
                    "replace",
                  );
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}

            {/* Suggestions Popover */}
            {isSuggestionsOpen &&
              (suggestions.organizations.length > 0 ||
                suggestions.contributors.length > 0) && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-ground border border-line rounded-xl shadow-pop z-50 overflow-hidden py-1.5 text-left divide-y divide-panel">
                  {/* Organizations Section */}
                  {suggestions.organizations.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[11px] font-[650] uppercase tracking-wider text-ink-soft">
                        Organizations
                      </div>
                      {suggestions.organizations.map((org, index) => {
                        const isSelected = selectedIndex === index;
                        return (
                          <button
                            key={org.login}
                            type="button"
                            onClick={() => handleSelectOrg(org)}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2.5 transition-colors ${
                              isSelected
                                ? "bg-brand-0 text-brand-600"
                                : "hover:bg-panel text-ink"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {org.avatarUrl ? (
                                <Image
                                  src={org.avatarUrl}
                                  alt={org.name || org.login}
                                  width={22}
                                  height={22}
                                  unoptimized
                                  className="w-5 h-5 rounded-md border border-line object-cover shrink-0 bg-panel"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-md border border-line bg-brand-0 text-brand-600 flex items-center justify-center font-[700] text-[9.5px] shrink-0">
                                  {org.login.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[13px] font-[600] truncate">
                                    {org.name || org.login}
                                  </span>
                                  <span className="text-[11.5px] text-ink-soft font-normal">
                                    @{org.login}
                                  </span>
                                  <span className="text-[9.5px] font-[600] text-brand-600 bg-brand-0 px-1.5 py-0.2 rounded border border-brand-100">
                                    Organization Search
                                  </span>
                                </div>
                                <div className="text-[11px] text-ink-soft">
                                  {org.contributorsCount}{" "}
                                  {org.contributorsCount === 1
                                    ? "contributor"
                                    : "contributors"}{" "}
                                  · {org.mergedPRs} merged PR
                                  {org.mergedPRs === 1 ? "" : "s"}
                                </div>
                              </div>
                            </div>
                            <span className="text-[11px] text-brand-600 font-[550] shrink-0">
                              View →
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Contributors Section */}
                  {suggestions.contributors.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[11px] font-[650] uppercase tracking-wider text-ink-soft">
                        Contributors
                      </div>
                      {suggestions.contributors.map((contrib, index) => {
                        const itemIndex =
                          suggestions.organizations.length + index;
                        const isSelected = selectedIndex === itemIndex;
                        return (
                          <button
                            key={contrib.login}
                            type="button"
                            onClick={() => handleSelectContributor(contrib)}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2.5 transition-colors ${
                              isSelected
                                ? "bg-brand-0 text-brand-600"
                                : "hover:bg-panel text-ink"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {contrib.avatarUrl ? (
                                <Image
                                  src={contrib.avatarUrl}
                                  alt={contrib.login}
                                  width={22}
                                  height={22}
                                  unoptimized
                                  className="w-5 h-5 rounded-full border border-line object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full border border-line bg-panel flex items-center justify-center font-[600] text-[9.5px] text-ink-soft shrink-0">
                                  {contrib.login.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-[13px] font-[600] truncate">
                                  {contrib.name || contrib.login}
                                </div>
                                <div className="text-[11px] text-ink-soft flex items-center gap-1.5">
                                  <span>@{contrib.login}</span>
                                  {(contrib.year || contrib.campus) && (
                                    <>
                                      <span>·</span>
                                      <span>
                                        {[contrib.year, contrib.campus]
                                          .filter(Boolean)
                                          .join(", ")}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="text-[11px] text-ink-soft shrink-0">
                              {contrib.mergedPRs} merged
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
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
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-soft pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
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
                    ? "bg-brand-solid border-brand-solid text-white font-[550]"
                    : "bg-ground border-line-strong text-ink-mid font-[450] hover:border-line-heavy hover:text-ink"
                } ${isPending && !isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span
                  className={
                    isLoading ? "opacity-0" : "opacity-100 transition-opacity"
                  }
                >
                  {label}
                </span>
                {isLoading && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Spinner
                      className={active ? "text-white" : "text-brand-500"}
                    />
                  </span>
                )}
              </button>
            );
          })}

          {/* Custom pill */}
          <button
            onClick={() => navigate("custom")}
            disabled={isPending}
            className={`relative h-9 px-4 rounded-full text-[13px] transition-colors border ${
              isCustomActive || showCustom
                ? "bg-brand-solid border-brand-solid text-white font-[550]"
                : "bg-ground border-line-strong text-ink-mid font-[450] hover:border-line-heavy hover:text-ink"
            } ${isPending && loadingTarget !== "custom" ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span
              className={
                isPending && loadingTarget === "custom"
                  ? "opacity-0"
                  : "opacity-100 transition-opacity"
              }
            >
              Custom
            </span>
            {isPending && loadingTarget === "custom" && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Spinner
                  className={
                    isCustomActive || showCustom
                      ? "text-white"
                      : "text-brand-500"
                  }
                />
              </span>
            )}
          </button>
        </div>

        {/* Custom date range picker */}
        {showCustom && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-panel">
            <div className="flex items-center gap-2">
              <label htmlFor="custom-from" className="text-xs text-ink-soft">
                From
              </label>
              <input
                id="custom-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 px-3 bg-panel border border-line rounded-[9px] text-[13px] text-ink focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-to" className="text-xs text-ink-soft">
                To
              </label>
              <input
                id="custom-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 px-3 bg-panel border border-line rounded-[9px] text-[13px] text-ink focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-0"
              />
            </div>
            <button
              onClick={handleCustomApply}
              disabled={!from || isPending}
              className="relative h-10 px-5 bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13.5px] font-[550] rounded-[11px] transition-colors"
            >
              <span
                className={
                  isPending && loadingTarget === "custom-apply"
                    ? "opacity-0"
                    : "opacity-100 transition-opacity"
                }
              >
                Apply
              </span>
              {isPending && loadingTarget === "custom-apply" && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Spinner className="text-white" />
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setShowCustom(false);
                navigate("all");
              }}
              className="h-9 px-3 text-xs text-ink-soft hover:text-ink transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Active filter labels or integrated organization context */}
        {orgContext ? (
          <div className="pt-2.5 border-t border-panel flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {orgContext.avatarUrl ? (
                <Image
                  src={orgContext.avatarUrl}
                  alt={orgContext.name || orgContext.login}
                  width={24}
                  height={24}
                  unoptimized
                  className="w-6 h-6 rounded-md border border-line object-cover shrink-0 bg-panel"
                />
              ) : (
                <div className="w-6 h-6 rounded-md border border-line bg-brand-0 text-brand-600 flex items-center justify-center font-[700] text-[10px]">
                  {orgContext.login.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-[13px] font-[650] text-ink truncate">
                  {orgContext.name || orgContext.login}
                </span>
                <span className="text-[11.5px] text-ink-soft truncate font-normal">
                  @{orgContext.login}
                </span>
                <span className="text-[10px] font-[600] text-brand-600 bg-brand-0 px-2 py-0.5 rounded-md border border-brand-100 shrink-0">
                  Organization Search
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-soft shrink-0">
              <span>
                <strong className="text-ink font-[650]">{orgContext.contributorsCount}</strong>{" "}
                {orgContext.contributorsCount === 1 ? "contributor" : "contributors"}
              </span>
              <span className="text-line-heavy">·</span>
              <span>
                <strong className="text-success-600 font-[650]">{orgContext.mergedPRs}</strong>{" "}
                merged PR{orgContext.mergedPRs === 1 ? "" : "s"}
              </span>
              <span className="text-line-heavy">·</span>
              <button
                onClick={() => {
                  setSearch("");
                  const qs = buildParams({ org: "", search: "" });
                  pushWithRefresh(qs ? `/contributors?${qs}` : "/contributors", "clear-org");
                }}
                className="underline underline-offset-2 hover:text-ink transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          hasActiveFilters && (
            <p className="text-ink-soft text-xs flex flex-wrap gap-x-2 items-center pt-1 border-t border-panel">
              {period !== "all" && (
                <span>
                  {period === "custom"
                    ? `Contributions from ${from}${to ? ` to ${to}` : " onwards"}`
                    : `Last ${
                        period === "1day"
                          ? "24 hours"
                          : period === "week"
                            ? "7 days"
                            : period === "month"
                              ? "30 days"
                              : period === "2months"
                                ? "2 months"
                                : "3 months"
                      }`}
                </span>
              )}
              {yearParam && (
                <>
                  {period !== "all" && <span className="text-line-heavy">·</span>}
                  <span className="text-brand-600 font-[550]">{yearParam}</span>
                </>
              )}
              {campusParam && (
                <>
                  {(period !== "all" || yearParam) && (
                    <span className="text-line-heavy">·</span>
                  )}
                  <span className="text-brand-600 font-[550]">{campusParam}</span>
                </>
              )}
              {search && (
                <>
                  {(period !== "all" || yearParam || campusParam) && (
                    <span className="text-line-heavy">·</span>
                  )}
                  <span>Searching &ldquo;{search}&rdquo;</span>
                </>
              )}
              <span className="text-line-heavy">·</span>
              <button
                onClick={() => {
                  setSearch("");
                  const qs = buildParams({ search: "", org: "" });
                  pushWithRefresh(qs ? `/contributors?${qs}` : "/contributors", "clear-all");
                }}
                className="underline underline-offset-2 hover:text-ink transition-colors"
              >
                Clear all
              </button>
            </p>
          )
        )}
      </div>
    </div>
  );
}
