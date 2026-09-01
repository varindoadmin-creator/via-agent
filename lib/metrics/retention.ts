// ─── Retention ─────────────────────────────────────────────────────────────────
// VIA Phase 12, brief section 28: retention defined explicitly as customer
// retention (did they buy again?) — never conflated with "revenue
// retention" (which would ask whether the same REVENUE recurred, a
// different question this module does not answer).

export interface CustomerRetentionInput {
  periodALabel: string;
  periodACustomerIds: string[];
  periodBLabel: string;
  periodBCustomerIds: string[];
}

export interface CustomerRetentionResult {
  definition: string;
  periodALabel: string;
  periodBLabel: string;
  periodACustomerCount: number;
  retainedCustomerCount: number;
  retentionRate: number | null;
  retainedCustomerIds: string[];
  lapsedCustomerIds: string[];
}

const DEFINITION = 'Customer retention: share of customers who purchased in Period A who also purchased again in Period B. This is customer retention, not revenue retention.';

export function computeCustomerRetention(input: CustomerRetentionInput): CustomerRetentionResult {
  const periodBSet = new Set(input.periodBCustomerIds);
  const periodASet = new Set(input.periodACustomerIds);
  const retained = [...periodASet].filter(id => periodBSet.has(id));
  const lapsed = [...periodASet].filter(id => !periodBSet.has(id));
  return {
    definition: DEFINITION,
    periodALabel: input.periodALabel, periodBLabel: input.periodBLabel,
    periodACustomerCount: periodASet.size, retainedCustomerCount: retained.length,
    retentionRate: periodASet.size > 0 ? retained.length / periodASet.size : null,
    retainedCustomerIds: retained, lapsedCustomerIds: lapsed,
  };
}
