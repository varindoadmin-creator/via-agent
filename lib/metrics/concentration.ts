// ─── Concentration / Pareto ────────────────────────────────────────────────────
// VIA Phase 12, brief sections 25-27: customer/product concentration and
// Pareto breakdown. `calculateConcentration` (top-N, e.g. "top 5 customers
// %") already exists in `lib/jarvis/intelligence/metrics.ts` and is reused
// here rather than duplicated; this file adds the percentage-of-population
// framing ("top X% of customers/products account for Y% of metric") the
// brief's section 27 specifically asks for, which top-N alone doesn't answer.

import { calculateConcentration, type NamedValue } from '../jarvis/intelligence/metrics.ts';

export { calculateConcentration, type NamedValue };

export interface ParetoResult {
  topPercent: number;
  entityCount: number;
  entitiesInTopSlice: number;
  metricShareInTopSlice: number;
  total: number;
}

/**
 * "The top `topPercent`% of entities account for what share of the total?"
 * Deterministic: sorts descending by value, takes the ceiling of
 * `topPercent`% of the population, sums their share of the total.
 */
export function paretoBreakdown(rows: NamedValue[], topPercent: number): ParetoResult {
  if (topPercent <= 0 || topPercent > 100) throw new Error('topPercent must be between 0 and 100.');
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const sliceSize = Math.max(1, Math.ceil((topPercent / 100) * sorted.length));
  const slice = sorted.slice(0, sliceSize);
  const sliceTotal = slice.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  return {
    topPercent, entityCount: rows.length, entitiesInTopSlice: slice.length,
    metricShareInTopSlice: total > 0 ? sliceTotal / total : 0, total,
  };
}

/** Concentration risk is context-dependent, never automatically "bad" (brief section 25) — this only labels the magnitude, the caller/reader decides materiality. */
export function describeConcentrationMagnitude(topShare: number): 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' {
  if (topShare >= 0.5) return 'HIGH';
  if (topShare >= 0.3) return 'ELEVATED';
  if (topShare >= 0.15) return 'MODERATE';
  return 'LOW';
}
