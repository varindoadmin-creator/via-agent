// ─── What-changed decomposition ────────────────────────────────────────────────
// VIA Phase 12, brief section 33: for any metric change, decompose by
// dimension (customer, product, brand, salesperson, source, time...) and
// show where the change is concentrated — deterministic contribution
// analysis, never an LLM guess. Generalizes the exact math
// `lib/jarvis/intelligence/business.ts#decomposeSalesChange` already uses
// for customer/salesperson (kept as-is, tested, unmodified) to any
// dimension — callers pre-aggregate rows into `{dimensionValue, metricValue}`
// pairs for whichever dimension they're decomposing (product ID, brand,
// source, etc.), and this does the same current-vs-comparison contribution
// math generically.

export interface DimensionValue { dimensionValue: string; metricValue: number }

export interface DimensionContribution {
  dimensionValue: string;
  current: number;
  comparison: number;
  change: number;
  /** null when there was no net change to attribute a share of (division by zero). */
  contributionToChange: number | null;
}

function grouped(rows: DimensionValue[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) result.set(row.dimensionValue, (result.get(row.dimensionValue) ?? 0) + row.metricValue);
  return result;
}

/** Section 34: this identifies WHERE a metric moved, never WHY — callers must not present `contributionToChange` as a causal claim. */
export function decomposeMetricChange(current: DimensionValue[], comparison: DimensionValue[]): DimensionContribution[] {
  const now = grouped(current), then = grouped(comparison);
  const totalChange = [...now.values()].reduce((a, b) => a + b, 0) - [...then.values()].reduce((a, b) => a + b, 0);
  const keys = new Set([...now.keys(), ...then.keys()]);
  return [...keys].map(dimensionValue => {
    const currentValue = now.get(dimensionValue) ?? 0, comparisonValue = then.get(dimensionValue) ?? 0;
    const change = currentValue - comparisonValue;
    return {
      dimensionValue, current: currentValue, comparison: comparisonValue, change,
      contributionToChange: totalChange === 0 ? null : change / totalChange,
    };
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.dimensionValue.localeCompare(b.dimensionValue));
}

export function topContributors(contributions: DimensionContribution[], limit = 5): DimensionContribution[] {
  return contributions.slice(0, limit);
}

/** Section 31: bottleneck stage names for the WATI commercial funnel — used to identify where drop-off occurs, never to infer a missing stage as a failure (a customer who never asked about stock simply skipped that stage, not "failed" it). */
export const FUNNEL_STAGES = ['INQUIRY', 'PRODUCT', 'PRICE', 'STOCK', 'QUOTE', 'SALES_ORDER'] as const;
export type FunnelStage = typeof FUNNEL_STAGES[number];

export interface FunnelStageCount { stage: FunnelStage; count: number }

export interface FunnelBottleneck {
  stage: FunnelStage;
  nextStage: FunnelStage;
  countAtStage: number;
  countAtNextStage: number;
  dropOffRate: number | null;
}

/** Identifies the single largest observed drop-off between consecutive stages. Stages with 0 entrants are skipped, not treated as a 100% failure. */
export function identifyFunnelBottleneck(counts: FunnelStageCount[]): FunnelBottleneck | null {
  const byStage = new Map(counts.map(c => [c.stage, c.count]));
  const transitions: FunnelBottleneck[] = [];
  for (let i = 0; i < FUNNEL_STAGES.length - 1; i++) {
    const stage = FUNNEL_STAGES[i], nextStage = FUNNEL_STAGES[i + 1];
    const countAtStage = byStage.get(stage) ?? 0;
    const countAtNextStage = byStage.get(nextStage) ?? 0;
    if (countAtStage === 0) continue; // never infer a 100% drop-off from an unobserved stage
    transitions.push({ stage, nextStage, countAtStage, countAtNextStage, dropOffRate: 1 - countAtNextStage / countAtStage });
  }
  if (transitions.length === 0) return null;
  return transitions.reduce((worst, t) => (t.dropOffRate ?? 0) > (worst.dropOffRate ?? 0) ? t : worst);
}
