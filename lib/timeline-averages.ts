/**
 * lib/timeline-averages.ts
 *
 * The two per-PR quality numbers, averaged over a span of the community
 * timeline: project impact (the repo multiplier M, lib/repo-score.ts) and
 * effort (the contribution value E, lib/pr-value.ts). Each month of the
 * timeline keeps running sums, so an average over any span is sums over
 * counts, never a mean of means that a quiet month could skew.
 *
 * No imports on purpose: the chart is a client component and must not pull
 * lib/community-timeline (and through it the KV client) into the browser.
 */

/** The sums a month (or a filtered sum of months) carries. Model units. */
export interface QualitySums {
  merged: number;
  /** Sum of M over merged PRs; absent on records built before this existed. */
  impactSum?: number;
  /** Sum of E over the merged PRs that have been measured, and how many those were. */
  effortSum?: number;
  effortMeasured?: number;
}

export interface QualityAverages {
  /** Mean M per merged PR, model units (0.15..3), or null when nothing was summed. */
  impact: number | null;
  /** Mean E per measured merged PR, model units (0.4..2), or null when nothing was measured. */
  effort: number | null;
  merged: number;
  measured: number;
}

export function averagesOf(parts: Iterable<QualitySums>): QualityAverages {
  let merged = 0;
  let impactSum = 0;
  let effortSum = 0;
  let measured = 0;
  for (const p of parts) {
    merged += p.merged;
    impactSum += p.impactSum ?? 0;
    effortSum += p.effortSum ?? 0;
    measured += p.effortMeasured ?? 0;
  }
  return {
    impact: merged > 0 && impactSum > 0 ? impactSum / merged : null,
    effort: measured > 0 ? effortSum / measured : null,
    merged,
    measured,
  };
}
