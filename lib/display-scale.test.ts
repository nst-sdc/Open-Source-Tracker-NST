import { describe, it, expect } from 'vitest';
import { impactOutOf10, prValueOutOf10, outOf10, MODEL_IMPACT_MAX, MODEL_VALUE_MAX } from './display-scale';
import { MULTIPLIER_MAX, MULTIPLIER_MIN } from './repo-score';
import { PR_VALUE_MAX, PR_VALUE_MIN, PR_VALUE_NEUTRAL } from './pr-value';

describe('display scale', () => {
  it('stays pinned to the model maxima it cannot import', () => {
    expect(MODEL_IMPACT_MAX).toBe(MULTIPLIER_MAX);
    expect(MODEL_VALUE_MAX).toBe(PR_VALUE_MAX);
  });
  it('maps both ranges onto 10 with the neutral change at 5', () => {
    expect(impactOutOf10(MULTIPLIER_MAX)).toBe(10);
    expect(impactOutOf10(MULTIPLIER_MIN)).toBeCloseTo(0.5, 5);
    expect(prValueOutOf10(PR_VALUE_MAX)).toBe(10);
    expect(prValueOutOf10(PR_VALUE_MIN)).toBe(2);
    expect(prValueOutOf10(PR_VALUE_NEUTRAL)).toBe(5);
    expect(outOf10(impactOutOf10(1.0))).toBe('3.3');
  });
});
