# VIA Customer Operations — Phase 9 (Customer Service, Sales & Marketing Analytics, Conversion Funnels & Management Insights)

## The one real architectural decision

Phases 2-8 already produce durable, well-shaped fact tables for every stage of the customer-operations pipeline: `wati_messages` (intent/source), `stock_inquiries` (vendor timing), `customer_channel_identities`/`customer_drafts` (onboarding), `commercial_drafts`/`commercial_draft_lines` (quotation/order funnel, already carrying `conversation_id`/`customer_id`/`zoho_object_id` linkage), and `wati_conversation_state`/`customer_service_audit_log` (handoff/SLA). The brief itself instructs "do not create duplicate event streams if reliable canonical events already exist" and "reuse the current data model where practical."

So this phase does **not** rebuild those as events. It adds exactly one new, additive table — **`analytics_events`** — used only for funnel-stage transitions that no existing table durably captures as a single fact on its own (a lead's first contact, a product/stock/price inquiry, a handoff, a draft/quotation/order creation, an onboarding completion). Everything else (resolution time, SLA compliance, vendor response time, onboarding completion, revenue) is computed **directly from the existing Phase 2-8 tables** at request time — recomputing them into a duplicate event stream would itself violate the brief's own instruction, and would risk the two sources of truth drifting apart.

## `analytics_events`

`id, organization_id, event_type, occurred_at, recorded_at, conversation_id, customer_id, product_id, inquiry_id, draft_id, order_id, source, channel, actor_type, team_id, properties jsonb, schema_version, dedupe_key`, with a **unique index on `dedupe_key`** (`${eventType}:${sourceId}`). `lib/analytics/events.ts`'s `recordAnalyticsEvent()` upserts with `Prefer: resolution=ignore-duplicates` — a retried webhook or a race between two code paths recording the same logical event never double-counts. It **never throws**: a failed analytics write must never break the operational flow it observes (mirrors every other best-effort side-channel in this codebase, e.g. WATI contact sync).

Event types emitted this pass, and where each is recorded:
- `lead.created` — `lib/integrations/wati/pipeline.ts`, dedupe-keyed on phone alone, so it fires exactly once per phone ever.
- `product.inquiry`, `stock.inquiry`, `price.inquiry` — same pipeline, on the corresponding resolved intent.
- `handoff.created` — `lib/customerService/handoff.ts`'s `triggerHandoff`.
- `commercial_draft.created` — `lib/integrations/wati/commercial/draft.ts`'s `createCommercialDraft`.
- `quotation.created` / `order.created` — `lib/commercialApprovals/executeCommercialDraft.ts`, on the QUOTATION/SALES_ORDER branch respectively, right after the Zoho write is confirmed.
- `customer.onboarding.completed` — `lib/commercialApprovals/executeCustomerCreation.ts`, right after the Zoho customer is created.

All gated by `ANALYTICS_EVENT_PIPELINE_ENABLED` (off by default). With it off, every dashboard/Jarvis metric that reads existing Phase 2-8 tables directly still works — only the handful of funnel-stage counts that specifically need `analytics_events` are affected.

## The metric service — one source of truth

`lib/analytics/metricService.ts`'s `AnalyticsMetricService` (`getExecutiveOverview`, `getCustomerServiceDashboard`, `getStockDashboard`, `getCommercialDashboard`, `getOnboardingDashboard`, `getSourceAttributionDashboard`, `getDataQualityDashboard`) is the **only** thing the admin dashboard and the internal Jarvis analytics tools call. Neither ever queries a raw table or computes a KPI independently — so the two can never disagree. Each domain module underneath it (`customerServiceAnalytics.ts`, `stockAnalytics.ts`, `funnel.ts`, `onboardingAnalytics.ts`, `dataQuality.ts`, `sourceAttribution.ts`) reads its own phase's tables directly.

`lib/analytics/periods.ts`'s `resolveTimeGrain()` computes Asia/Jakarta (UTC+7) organization-local day/month boundaries, never raw UTC — a "Today" grain run at 2am UTC still reflects Jakarta's calendar day. `comparePeriods()` returns `percentChange: null` (never `Infinity`/`NaN`) when the previous-period value is 0, and flags `smallSample: true` when both values are under 10 — a swing like "3 vs 2" is never presented as a percentage claim.

## Commercial funnel — real linkage, not inference

`lib/analytics/funnel.ts`'s `getCommercialFunnel()` reads `commercial_drafts` directly by `created_at` range and uses the draft's own `zoho_object_id`/`total` fields. A draft that executed into a real Zoho Sales Order counts as exactly one conversion; a draft with no `zoho_object_id` is never counted as executed, and an unlinked Zoho order created outside this pipeline is never falsely attributed into the funnel either, since this only ever reads `commercial_drafts`, never a scan of all Zoho orders. `draftToOrderConversion`'s denominator excludes `DRAFT`/`CANCELLED` drafts explicitly — the eligible population is attributable drafts that reached a decision point, not every message that ever mentioned a product.

## Stock/vendor analytics — rates only, never a raw quantity

`lib/analytics/stockAnalytics.ts` reports OOS rate, no-response rate, Varindo-fallback rate, and human-escalation rate from `stock_inquiries` — Phase 3's confidentiality boundary (never disclosing exact system stock) is read, never bypassed. `getVendorPerformance()` breaks these down only by vendors actually present in the queried `primary_source` values — never a guessed or hard-coded vendor list, so a vendor VIA stops using simply stops appearing rather than showing as zero.

## Waiting-time decomposition — no double-count

`lib/analytics/waitingTimeBreakdown.ts`'s `computeCaseWaitingBreakdown()` decomposes a case's total open duration into vendor / internal / customer components: vendor minutes from `stock_inquiries` rows with a `primary_source` and `closed_at` inside the case window, internal minutes from `commercial_drafts` rows in an internal-review status, and customer minutes as `max(0, total - vendor - internal)` — never negative even if the two measured components together exceed the wall-clock total (overlapping windows are possible; the remainder is clamped rather than allowed to go negative).

## Bottleneck analysis — FACT / DIAGNOSIS / RECOMMENDATION, never conflated

`lib/analytics/bottleneck.ts` is deliberately structured so a management reader can tell what's observed from what's inferred from what's suggested:
- **FACT**: the actual period-over-period numbers (e.g. "median resolution time rose from 42m to 71m").
- **DIAGNOSIS**: which component (vendor/internal/customer wait) is the dominant driver of that change, by comparing the magnitude of each component's own period-over-period delta.
- **RECOMMENDATION**: a suggested action tailored to the driver — never presented as fact, and never fired at all when the underlying change is under 5% (noise) or the sample size is small (`confidence: 'LOW'` below 10 cases).

## Anomaly detection — simple thresholds, no ML

`lib/analytics/anomalyDetection.ts` checks today's SLA breach rate and each vendor's median response time against env-configurable thresholds (`ANOMALY_SLA_BREACH_RATE_THRESHOLD` default 0.25, `ANOMALY_VENDOR_RESPONSE_MINUTES_THRESHOLD` default 120), requiring `ANOMALY_MIN_SAMPLE_SIZE` (default 10) before firing at all. `app/api/wati/analytics/sweep` (a `middleware.ts` cron path, same pattern as the two existing sweeps) runs these once per invocation and sends **one bounded summary email** via the existing `lib/email/sendMail.ts` channel — never a new notification system, never per-anomaly spam.

## Jarvis integration — unreachable from WATI by construction

Five new internal-only tools (`get_customer_service_metrics`, `get_conversion_funnel`, `get_stock_operations_metrics`, `get_bottleneck_breakdown`, `get_vendor_performance`) are registered in `lib/jarvis/tools/registry.ts`, each a thin wrapper over `AnalyticsMetricService` — never computing a number independently. This registry is keyed by `Role` (admin/director) with no external-audience concept, and the WATI pipeline never imports it or `lib/jarvis/runner.ts` in the first place — so these tools are structurally unreachable from any external/WATI conversation, with zero new enforcement code required.

## Admin UI

`/requests/wati/analytics` — one page, five sections (Executive Overview, Customer Service, Stock/Vendor, Commercial Funnel, Source Attribution) plus a Data Quality footer, each responding to a shared time-grain picker (Today / Yesterday / Last 7 Days / This Month / Last Month) with period-over-period comparisons. Backed by a single `GET /api/requests/wati/analytics` route that calls `AnalyticsMetricService` directly — the same service the Jarvis tools call.

## Feature flags (all off by default)

`ANALYTICS_EVENT_PIPELINE_ENABLED`, `CUSTOMER_SERVICE_ANALYTICS_ENABLED`, `COMMERCIAL_FUNNEL_ANALYTICS_ENABLED`, `STOCK_ANALYTICS_ENABLED`, `SOURCE_ATTRIBUTION_ANALYTICS_ENABLED`, `JARVIS_MANAGEMENT_ANALYTICS_ENABLED`, `ANOMALY_DETECTION_ENABLED`, `MANAGEMENT_RECOMMENDATIONS_ENABLED`.

## Known limitations (documented, deliberately deferred)

- Product Demand / Customer Onboarding / Operational Excellence are sections of the one consolidated dashboard, not separate pages — the brief's own "keep layout useful, not overloaded."
- Website-price-mismatch history is not a queryable dashboard: Phase 5 only logs it via `console.info`, with no persistence table — would require new persistence, out of scope this pass.
- No CSV/XLSX export.
- No forecasting — the brief itself says not to build this without strong historical data.
- No backfill tooling — there is no pre-Phase-9 history in `analytics_events` to reprocess; moot until a body of history exists.
- Role-based analytics permissions match VIA's actual two-role reality (admin/director), not a fictional finer-grained matrix — same documented scoping choice as Phase 8.
