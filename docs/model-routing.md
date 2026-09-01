# VIA Model Routing and Cost

Model selection, eligibility, and cost-estimation mechanics are documented in `docs/jarvis-model-routing-cost-engineering.md` and are not repeated here. This document covers what Phase 13 adds on top: durable cost observability.

## What was missing before this phase

`lib/jarvis/runner.ts` already computed token usage, latency, and estimated cost on every run — but only ever logged it via `console.info('[jarvis.run]', ...)`, which reaches Cloud Run's stdout logs and nowhere else. There was no way to answer "how much has Jarvis cost this week" without manually grepping logs. Brief section 48 asks for a real cost dashboard; this required genuinely new persistence, not just a new read over existing data.

## What Phase 13 adds

- **`supabase/jarvis_model_usage_log.sql`** — one row per Jarvis run: model, routing tier, routing reason, token counts, estimated cost (when pricing is configured), latency, conversation ID. Additive; apply the migration, then set `JARVIS_MODEL_USAGE_LOG_ENABLED=true` (staged rollout, same convention as `jarvis_reliability.sql`/`JARVIS_RELIABILITY_SCHEMA_ENABLED`).
- **`lib/jarvis/models/usageLog.ts`** — `recordModelUsage()`, called from `runner.ts` right after the existing console.info, best-effort and never throws (matches every other analytics-recording side channel in this codebase).
- **`lib/jarvis/models/costDashboard.ts`** — `getModelCostSummary(range)`: total requests, tokens, estimated cost, split by model and by routing tier, cost per distinct conversation, over a selectable time grain (reuses `lib/analytics/periods.ts`'s `resolveTimeGrain`, the same time-boundary logic every other dashboard uses).
- **`/requests/wati/system-health`** (director-only section) and `GET /api/requests/wati/system-health/cost` surface it.

## Never fabricates a cost figure

`estimateJarvisCost` (existing, unchanged) already returns `pricingAvailable: false` when a model's pricing env vars aren't configured. `getModelCostSummary` propagates this honestly: `costEstimateComplete` is `false` if even one counted run lacked pricing, and the dashboard labels such a total as partial rather than presenting it as exact. Cost-per-conversation is `null` (not a misleading number) unless every contributing run had pricing configured.

## Operating it

1. Apply `supabase/jarvis_model_usage_log.sql`.
2. Set `JARVIS_MODEL_USAGE_LOG_ENABLED=true`.
3. Configure `JARVIS_MODEL_<TIER>_INPUT_PER_MILLION_USD`/`..._OUTPUT_PER_MILLION_USD` (per `docs/jarvis-model-routing-cost-engineering.md`) if you want cost estimates rather than just token/request counts.
4. View `/requests/wati/system-health` as a director.
