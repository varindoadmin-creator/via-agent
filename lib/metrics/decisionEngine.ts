// ─── Decision engine ────────────────────────────────────────────────────────────
// VIA Phase 12, brief section 32: the FACTS/DIAGNOSIS/OPTIONS/TRADE-OFFS/
// RECOMMENDATION/CONFIDENCE/DATA LIMITATIONS structure, generalizing
// `lib/analytics/bottleneck.ts`'s existing FACT/DIAGNOSIS/RECOMMENDATION
// pattern (kept as-is, unmodified, still used directly for its own two
// callers) to a fuller decision-support shape with multiple options and
// their trade-offs. Every field here is composed from already-computed
// deterministic inputs (a `whatChanged.ts` contribution, a `comparePeriods`
// result) — this module performs no independent business-critical
// arithmetic itself, and it never claims causation (brief section 34: use
// "concentrated in"/"associated with", never "caused by").

import type { DimensionContribution } from './whatChanged.ts';

export type DriverCategory = 'CUSTOMER' | 'PRODUCT' | 'VENDOR_STOCK' | 'SALESPERSON' | 'PRICING' | 'SOURCE' | 'OTHER';
export type DecisionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DecisionOption { option: string; tradeOff: string }

export interface DecisionBrief {
  facts: string[];
  diagnosis: string;
  options: DecisionOption[];
  recommendation: string;
  confidence: DecisionConfidence;
  dataLimitations: string[];
}

const OPTION_CATALOG: Record<DriverCategory, DecisionOption[]> = {
  VENDOR_STOCK: [
    { option: 'Improve vendor response SLA for the affected vendor(s).', tradeOff: "Requires vendor negotiation; not fully within Varindo's control." },
    { option: 'Prioritize products with reliable availability in customer-facing recommendations.', tradeOff: 'May reduce near-term revenue from products currently affected by stock issues.' },
  ],
  CUSTOMER: [
    { option: 'Prepare a targeted Sales follow-up for the customers driving the change.', tradeOff: 'Follow-up capacity is limited and may crowd out other Sales priorities.' },
    { option: 'Review whether a pricing or service issue is specific to these accounts.', tradeOff: 'Requires manual account review; no automated diagnosis exists for this.' },
  ],
  PRODUCT: [
    { option: 'Review pricing/availability for the specific product(s) driving the change.', tradeOff: 'Price changes require director approval and affect margin.' },
    { option: 'Investigate whether product information/enrichment gaps are reducing conversion.', tradeOff: 'Requires manual content review; no automated signal exists for this yet.' },
  ],
  SALESPERSON: [
    { option: 'Review workload/portfolio distribution across salespeople.', tradeOff: 'Reassigning accounts has relationship costs; do this deliberately, never automatically.' },
    { option: 'Provide targeted coaching/support to the affected salesperson(s).', tradeOff: 'Requires management time; impact is not immediately measurable.' },
  ],
  PRICING: [
    { option: 'Review whether a pricing or special-price policy change coincided with the movement.', tradeOff: 'Price changes affect margin and require director approval.' },
  ],
  SOURCE: [
    { option: 'Review marketing/lead-source spend allocation for the affected source.', tradeOff: 'Attribution coverage may be incomplete — do not reallocate budget from one period alone.' },
  ],
  OTHER: [
    { option: 'Investigate the top contributing entity manually.', tradeOff: 'No domain-specific option catalog applies; requires manual review.' },
  ],
};

export interface BuildDecisionBriefInput {
  facts: string[];
  topDriver: DimensionContribution | null;
  driverDimensionLabel: string;
  driverCategory: DriverCategory;
  confidence: DecisionConfidence;
  dataLimitations: string[];
}

export function buildDecisionBrief(input: BuildDecisionBriefInput): DecisionBrief {
  const diagnosis = input.topDriver
    ? `The change is concentrated in ${input.driverDimensionLabel} "${input.topDriver.dimensionValue}" (${input.topDriver.change >= 0 ? '+' : ''}${Math.round(input.topDriver.change).toLocaleString('id-ID')}${input.topDriver.contributionToChange !== null ? `, ${Math.round(input.topDriver.contributionToChange * 100)}% of the total movement` : ''}). This is where the change is concentrated — it is not established as the cause.`
    : 'No single dimension accounts for a majority of the movement; the change is spread broadly across the population.';

  const options = OPTION_CATALOG[input.driverCategory];
  const recommendation = options.length > 0
    ? `${options[0].option} This is the first option to try because it directly addresses the concentrated driver above — revisit if the next period does not confirm the pattern.`
    : 'No specific action is recommended without further manual investigation.';

  return { facts: input.facts, diagnosis, options, recommendation, confidence: input.confidence, dataLimitations: input.dataLimitations };
}
