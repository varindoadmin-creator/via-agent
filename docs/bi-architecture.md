# VIA — BI & Decision Engineering Architecture (Phase 12)

## The core loop

```text
Operational Systems (Zoho Books, WATI/commercial_drafts, requests, stock_inquiries)
        ↓
Canonical Facts (Zoho invoices/items/payments; Supabase's commercial_drafts/wati_messages/stock_inquiries)
        ↓
Governed metric functions (lib/analytics/*, lib/jarvis/intelligence/*, lib/metrics/*)
        ↓ indexed by
lib/metrics/registry.ts's GOVERNED_METRIC_REGISTRY
        ↓
Decision models (lib/metrics/forecast.ts, scenario.ts, segmentation.ts, concentration.ts,
                  cohort.ts, retention.ts, whatChanged.ts, decisionEngine.ts)
        ↓
Jarvis (lib/jarvis/tools/decisionEngineering.ts — internal-only, never the WATI pipeline)
```

**The non-negotiable that shaped every design decision in this phase**: Jarvis never queries a raw table or computes a business number itself. Every tool in `lib/jarvis/tools/decisionEngineering.ts` is a thin wrapper — it fetches already-governed data (via an existing Zoho fetch helper or a narrow Supabase read) and hands it to a pure, deterministic `lib/metrics/*` function. The LLM's only job is choosing which tool to call and narrating the result.

## Why two BI systems already existed, and why this phase doesn't merge them

VIA already had two independent, both-correct-for-their-domain analytics layers before this phase:

1. **`lib/analytics/*` (Phase 9)** — WATI/commercial-ops funnel metrics, Supabase-only, near-real-time, governed by `metricRegistry.ts` + `metricService.ts`. Powers `/requests/wati/analytics`.
2. **`lib/jarvis/intelligence/*` (pre-Phase-9, "V1 BI")** — Zoho-accounting metrics (revenue, GP, receivables, sales drivers, a customer-recovery scenario), live Zoho reads, Jarvis-tool-only (no dashboard). Already had `decomposeSalesChange` (what-changed decomposition), `calculateConcentration` (Pareto/top-N), and `modelCustomerRecoveryScenario` (a scenario engine) — all reused directly by this phase rather than rebuilt.

Rewriting either into the other would have meant re-deriving and re-testing formulas that already work. Phase 12 instead adds **`lib/metrics/*`** as a third, thin layer that (a) indexes both existing systems under one `GovernedMetricDefinition` shape (`registry.ts`) and (b) adds the genuinely new capabilities neither system had: forecasting, a generalized scenario engine, customer segmentation, Pareto/concentration framing, cohort/retention, a structured decision-brief composer, decision/experiment record-keeping, and cash-collected.

## What's genuinely new vs. reused

**Reused directly, unmodified**: `lib/analytics/metricRegistry.ts`, `metricService.ts`, `periods.ts`, `bottleneck.ts`, `dataQuality.ts`; `lib/jarvis/intelligence/business.ts` (`decomposeSalesChange`, `identifyCustomerOpportunities`, `modelCustomerRecoveryScenario`), `metrics.ts` (`calculateConcentration`, `calculateGrowth`), `executive.ts`, `receivables.ts`; `lib/jarvis/tools/analytics.ts`'s `fetchInvoices`/`observations`/`validatePeriod` (now exported for reuse); `lib/customerDuplicates/snapshotStore.ts`'s persisted duplicate-scan snapshot; `lib/zoho/purchaseHistory.ts` (Phase 11); `lib/jarvis/security/policy.ts`'s permission model (extended, not replaced — two new permissions added for decision/experiment writes); `lib/jarvis/tools/registry.ts`'s `read`/`analyze`/`write` factories and the entire instrumentation/circuit-breaker/audit wrapper.

**New this phase**: `lib/metrics/` (registry, cashCollected, segmentation, concentration, cohort, retention, forecast, scenario, whatChanged, decisionEngine, decisionStore, experimentStore, dataQuality); `management_decisions`/`management_experiments` tables; 20 new internal Jarvis tools; two new `customer_outreach_suppressions`-style small Supabase tables; a Customer Segments + Extended Data Quality section on the existing analytics dashboard; 7 new `AnalyticsEventType` values.

## Structural external-audience guarantee

`lib/jarvis/tools/decisionEngineering.ts` (like every internal-only tool file before it) is registered only in `lib/jarvis/tools/registry.ts`, which `lib/integrations/wati/pipeline.ts` never imports. This is not a runtime check — it is unreachable by construction, satisfying brief section 38/48's "external customer: NO management BI tools" without any new enforcement code.

## Role scoping (documented limitation, same as Phase 9/10)

The brief's section 38 describes Management/Sales/Finance/Operations-scoped BI access. VIA has exactly two shared-role accounts (`admin`, `director`) with no finer-grained permission system — the same reality Phase 8, 9, and 10 already documented. Every BI tool in this phase requires `director`; `admin` gets none (matching `ADMIN_PERMISSIONS = ['jarvis.chat']`, unchanged). A fictional Sales/Finance/Operations role split was not built; if VIA ever gains real per-user accounts, `permissionForTool()`'s category-based mapping is where that split would attach.

## Dashboard scope

Only the cheap, Supabase-only Phase 12 additions (customer segments, extended data quality) were added to `/requests/wati/analytics`. Forecast/scenario/concentration/cohort/decision-brief all need explicit date-range or method parameters and hit live Zoho — a natural fit for the Jarvis conversational interface (this phase's actual stated goal, brief section 1/37), not a fixed-grain dashboard widget. Building 13 separate dashboard pages (brief section 7's full list) was not attempted — same "one consolidated dashboard, not overloaded" scoping Phase 9 already established for itself.
