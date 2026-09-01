# VIA — Metric Registry (Phase 12)

## Why a second registry doc exists

`docs/metrics-registry.md` (plural, Phase 9) already documents `lib/analytics/metricRegistry.ts`'s `METRIC_REGISTRY` — the WATI/commercial-ops funnel metrics (conversations, handoffs, SLA, stock inquiries, draft-to-order conversion). It is unchanged and still accurate. This document adds the layer Phase 12 asks for: `lib/metrics/registry.ts`'s `GOVERNED_METRIC_REGISTRY`, which indexes **both** that registry **and** the pre-existing Zoho-accounting BI layer (`lib/jarvis/intelligence/business.ts`'s `BUSINESS_METRIC_REGISTRY`) under one shape, plus the handful of metrics genuinely new to this phase. It is a governance/documentation layer — `computedBy` on every entry points at the real implementation; nothing here re-implements a formula.

## The `GovernedMetricDefinition` shape

```ts
interface GovernedMetricDefinition {
  metricId: string; name: string; businessDefinition: string; formula: string;
  grain: 'EVENT' | 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
  source: 'Zoho Books' | 'VIA' | 'Zoho Books + VIA';
  filters: string[]; timeBasis: string; currencyBasis: 'IDR' | 'TRANSACTION_CURRENCY';
  owner: 'SALES' | 'FINANCE' | 'OPERATIONS' | 'MANAGEMENT' | 'CUSTOMER_SERVICE';
  freshness: 'LIVE' | 'NEAR_REAL_TIME' | 'DAILY_SYNC';
  classification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL';
  version: number; computedBy: string;
}
```

`getGovernedMetric(metricId)` and `listGovernedMetrics(owner?)` are the only read paths; `isExternallyDisclosable()` returns true only for `PUBLIC` (nothing is currently marked `PUBLIC` — every registered metric is at least `INTERNAL`).

## Revenue terminology (brief section 4 — non-negotiable)

Five distinct metrics, never collapsed into one "sales" or "revenue" figure:

| Metric ID | What it actually is | Classification |
|---|---|---|
| `quotation_value` | Value of quotations prepared, whether accepted or not | INTERNAL |
| `sales_order_value` | Confirmed committed order value — not yet invoiced or collected | INTERNAL |
| `invoiced_sales` | Zoho-recognized revenue before PPN (the ONLY metric that may be called "revenue") | CONFIDENTIAL |
| `cash_collected` | Actual Zoho customer payments received — new this phase (`lib/metrics/cashCollected.ts`) | CONFIDENTIAL |
| `open_receivables` | Billed but not yet collected | CONFIDENTIAL |

A dashboard or Jarvis response that uses "revenue" for `sales_order_value` or `cash_collected` is a bug — `get_governed_metric_definition` exists precisely so a caller can check before labeling a number.

## Everything else in the registry

`quotation_conversion_rate` (= Phase 9's `draft_to_order_conversion`), `average_order_value`, `customer_reorder_rate` (delegates to `lib/zoho/purchaseHistory.ts`, built in Phase 11), and `gross_profit_current_rate` (delegates to the existing `analyze_gross_profit` tool's `grossProfit()` function) round out the registry. See `docs/metrics-registry.md` for the full list of Phase 9's own 16 WATI-ops metrics, unchanged.

## Consistency guarantee

Every Jarvis BI tool in `lib/jarvis/tools/decisionEngineering.ts` and `lib/jarvis/tools/analytics.ts`/`financeOperations.ts`/`executiveData.ts` computes through the functions this registry points at — never an independent calculation. The dashboard (`/requests/wati/analytics`) reads the same Phase 9 `AnalyticsMetricService` and the same Phase 12 `lib/metrics/*` functions for its new sections. This is what makes Test 43 ("dashboard and Jarvis return the same definition/value") true by construction, not by convention alone.
