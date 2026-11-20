/**
 * lib/display-scale.ts
 *
 * The two per-PR numbers are modelled on ranges that are right for the
 * maths and odd to read: the project multiplier runs 0.15..3.0 and a PR's
 * contribution value 0.4..2.0. Everything a person sees shows both out of
 * 10 instead, scaled linearly, so "Impact 10" is the biggest project and
 * "Value 10" the most substantial change. Display only: ranking, caches and
 * the API keep the model values.
 *
 * No imports on purpose: client components use this, and lib/repo-score
 * pulls the whole server-side scoring graph (down to child_process) behind
 * it. lib/display-scale.test.ts pins these two constants to the model's.
 */
export const DISPLAY_MAX = 10;
/** = MULTIPLIER_MAX in lib/repo-score.ts */
export const MODEL_IMPACT_MAX = 3.0;
/** = PR_VALUE_MAX in lib/pr-value.ts */
export const MODEL_VALUE_MAX = 2.0;

/** Project impact of a repo multiplier, out of 10 (0.5 .. 10). */
export function impactOutOf10(multiplier: number): number {
  return (multiplier * DISPLAY_MAX) / MODEL_IMPACT_MAX;
}

/** Contribution value of a PR, out of 10 (2 .. 10; a typical code change is 5). */
export function prValueOutOf10(value: number): number {
  return (value * DISPLAY_MAX) / MODEL_VALUE_MAX;
}

/** One decimal, as shown everywhere. */
export const outOf10 = (n: number) => n.toFixed(1);
