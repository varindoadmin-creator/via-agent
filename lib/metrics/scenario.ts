// ─── Scenario analysis ─────────────────────────────────────────────────────────
// VIA Phase 12, brief sections 23-24: a scenario applies deterministic
// arithmetic to an explicitly supplied management assumption — it is never a
// forecast (that's forecast.ts, which extrapolates from history; a scenario
// never looks at history at all, only the baseline and the assumption the
// caller supplies). Generalizes the pre-existing
// `lib/jarvis/intelligence/business.ts#modelCustomerRecoveryScenario` pattern
// (arithmetic + a fixed `assumptions` disclosure list) to arbitrary
// baseline-metric "what if" questions.

export type AssumptionType = 'ABSOLUTE' | 'PERCENT';

export interface ScenarioInput {
  metricId: string;
  metricLabel: string;
  baselineValue: number;
  assumptionLabel: string;
  assumptionType: AssumptionType;
  /** For ABSOLUTE: the new value. For PERCENT: the fractional change, e.g. 0.1 for +10%. */
  assumptionDelta: number;
}

export interface ScenarioResult {
  scenario: true; // always present — a structural marker so a caller can never mistake this for a forecast
  metricId: string;
  metricLabel: string;
  baselineValue: number;
  assumedValue: number;
  absoluteChange: number;
  percentChange: number | null;
  assumptionLabel: string;
  disclaimer: string;
}

export function runScenario(input: ScenarioInput): ScenarioResult {
  const assumedValue = input.assumptionType === 'ABSOLUTE'
    ? input.assumptionDelta
    : input.baselineValue * (1 + input.assumptionDelta);
  const absoluteChange = assumedValue - input.baselineValue;
  return {
    scenario: true,
    metricId: input.metricId, metricLabel: input.metricLabel,
    baselineValue: input.baselineValue, assumedValue, absoluteChange,
    percentChange: input.baselineValue === 0 ? null : absoluteChange / input.baselineValue,
    assumptionLabel: input.assumptionLabel,
    disclaimer: 'This is a scenario, not a forecast or prediction — it applies arithmetic to a management-supplied assumption. It does not model customer behavior, market conditions, or competing effects.',
  };
}

// ── Named presets matching the brief's own examples (section 23) ──

export interface QuotationConversionScenarioInput {
  quotationCount: number;
  currentConversionRate: number;
  targetConversionRate: number;
  averageOrderValue: number;
}

/** "What if quotation conversion increases from 20% to 25%?" */
export function scenarioQuotationConversionChange(input: QuotationConversionScenarioInput): ScenarioResult & { additionalOrders: number; additionalSalesOrderValue: number } {
  if (input.targetConversionRate < 0 || input.targetConversionRate > 1 || input.currentConversionRate < 0 || input.currentConversionRate > 1) {
    throw new Error('Conversion rates must be between 0 and 1.');
  }
  const base = runScenario({
    metricId: 'quotation_conversion_rate', metricLabel: 'Quotation Conversion Rate',
    baselineValue: input.currentConversionRate,
    assumptionLabel: `Conversion rate assumed to move from ${(input.currentConversionRate * 100).toFixed(1)}% to ${(input.targetConversionRate * 100).toFixed(1)}%`,
    assumptionType: 'ABSOLUTE', assumptionDelta: input.targetConversionRate,
  });
  const additionalOrders = input.quotationCount * (input.targetConversionRate - input.currentConversionRate);
  return { ...base, additionalOrders, additionalSalesOrderValue: additionalOrders * input.averageOrderValue };
}

export interface AverageOrderValueScenarioInput {
  currentAverageOrderValue: number;
  percentIncrease: number; // e.g. 0.1 for +10%
  orderCount: number;
}

/** "What if average order value increases 10%?" */
export function scenarioAverageOrderValueChange(input: AverageOrderValueScenarioInput): ScenarioResult & { additionalSalesOrderValue: number } {
  const base = runScenario({
    metricId: 'average_order_value', metricLabel: 'Average Order Value',
    baselineValue: input.currentAverageOrderValue,
    assumptionLabel: `Average order value assumed to increase ${(input.percentIncrease * 100).toFixed(1)}%`,
    assumptionType: 'PERCENT', assumptionDelta: input.percentIncrease,
  });
  return { ...base, additionalSalesOrderValue: base.absoluteChange * input.orderCount };
}
