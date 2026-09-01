# VIA — Management Decision Engine (Phase 12)

## The structure (brief section 32)

`lib/metrics/decisionEngine.ts`'s `buildDecisionBrief()` generalizes the existing FACT/DIAGNOSIS/RECOMMENDATION shape (`lib/analytics/bottleneck.ts`, Phase 9, unmodified) into the fuller structure this phase asks for:

```text
FACTS              — caller-supplied, each traced to a real comparePeriods/aggregate call
DIAGNOSIS          — generated FROM a lib/metrics/whatChanged.ts contribution, not free text
OPTIONS            — 1-2 fixed candidates from a small catalog, keyed by which dimension moved
  + TRADE-OFFS       (each option always carries its trade-off, never presented alone)
RECOMMENDATION     — the first cataloged option, with a one-line reason it's first
CONFIDENCE         — HIGH/MEDIUM/LOW, derived from sample size (small-sample = LOW)
DATA LIMITATIONS   — caller-supplied array, always present even when short
```

Every field traces to a deterministic input; the function performs no independent business-critical arithmetic (brief's core principle) — it only composes strings from numbers `whatChanged.ts` and `comparePeriods()`/`fetchInvoices` already produced.

## Root-cause language (brief section 34)

The diagnosis template always says "the change is concentrated in X — it is not established as the cause", never "caused by". `lib/metrics/decisionEngine.test.ts` asserts this literally (`doesNotMatch(/caused by/i)`).

## What-changed decomposition

`lib/metrics/whatChanged.ts`'s `decomposeMetricChange(current, comparison)` is the generalized version of `lib/jarvis/intelligence/business.ts#decomposeSalesChange` (kept as-is for its own customer/salesperson callers) — any dimension a caller can pre-aggregate into `{dimensionValue, metricValue}` pairs. `get_decision_brief` currently wires this to customer/salesperson via live Zoho invoices; product/brand/source decomposition is possible with the same function once a caller supplies the aggregation (see `docs/bi-architecture.md`'s brand-analytics limitation for why product/brand isn't wired to invoice-line data this pass).

`identifyFunnelBottleneck()` (same file) finds the largest real stage-to-stage drop-off in the WATI commercial funnel (`INQUIRY → PRODUCT → PRICE → STOCK → QUOTE → SALES_ORDER`) — an unobserved stage (0 entrants) is skipped, never treated as a 100% failure (brief section 31's explicit instruction; tested).

## Decision records (brief section 35)

`management_decisions` (new table) + `lib/metrics/decisionStore.ts`: `recordDecision()` captures `decision`, `rationale`, an optional loose link to an `operational_findings` or `proactive_customer_actions` row, `decidedBy`, `expectedOutcome`, and `reviewDate`. `reviewDecision()` later records the human-stated `actualOutcome` — this comparison is never automated; VIA has no mechanism to infer whether a decision "worked," only to hold the space for a human to say so.

## Management experiments (brief section 36)

`management_experiments` (new table) + `lib/metrics/experimentStore.ts`. The one non-negotiable enforced in code: `recordExperimentResult()` never sets a conclusion when either side's sample size is below `MIN_EXPERIMENT_SAMPLE_SIZE` (10, matching `lib/analytics/periods.ts`'s existing small-sample threshold) — it marks the row `INSUFFICIENT_DATA` with an explanatory `conclusionNotes` instead. Above the threshold, a change under 5% (the same materiality bar `bottleneck.ts` already uses) concludes `NO_CHANGE`; `higherIsBetter` flips the IMPROVED/WORSENED label without touching the underlying arithmetic (tested).

## Jarvis surface

`lib/jarvis/tools/decisionEngineering.ts` exposes `get_decision_brief`, `record_management_decision`, `review_management_decision`, `list_management_decisions`, `get_decision_detail`, `create_management_experiment`, `record_experiment_result`, `list_management_experiments`, `get_experiment_detail` — all `director`-only, all audited through the existing `instrument()` wrapper in `lib/jarvis/tools/registry.ts`. Two new `JarvisPermission` values (`management_decisions.manage`, `management_experiments.manage`) were added to `lib/jarvis/security/policy.ts` because these write actions have no natural existing `.read` permission to fall back to (unlike most WRITE-risk tools in this codebase).

## Known limitations

- No automatic linkage validation between `linked_finding_id` and the referenced table — it is a loose reference (by design, since it may point at either `operational_findings` or `proactive_customer_actions`), not a foreign key.
- No UI for decision/experiment records this pass — they are Jarvis-tool-only. A dedicated admin queue (mirroring `/requests/wati/operational-intelligence`'s pattern) is natural future work once real usage patterns are observed.
