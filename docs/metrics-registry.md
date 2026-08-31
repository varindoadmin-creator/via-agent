# VIA Customer Operations — Metrics Registry (Phase 9, brief sections 38-39)

Every KPI's formula is documented once, centrally, in `lib/analytics/metricRegistry.ts`'s `METRIC_REGISTRY`. The admin dashboard (`/requests/wati/analytics`) and the internal Jarvis analytics tools both compute these through `lib/analytics/metricService.ts`, never independently — so a number reported by Jarvis and the same number shown on the dashboard can never drift apart. `getMetricDefinition(key)` looks up one definition by key.

| Key | Name | Unit | Formula | Dimensions |
|---|---|---|---|---|
| `inbound_conversations` | Inbound Conversations | COUNT | `count(wati_conversation_state rows touched in range)` | date |
| `auto_resolution_rate` | Auto Resolution Rate | PERCENT | `(inbound_conversations - handoff_count) / inbound_conversations` | date |
| `human_handoff_rate` | Human Handoff Rate | PERCENT | `handoff_count / inbound_conversations` | date, handoff_reason, team |
| `human_resolution_rate` | Human Resolution Rate | PERCENT | `resolved_handoffs / handoff_count` | date, team |
| `median_resolution_minutes` | Median Resolution Time | MINUTES | `median(resolved_at - handoff_created_at)` over resolved cases | date, team |
| `sla_compliance` | SLA Compliance | PERCENT | `ON_TIME cases / evaluated cases` | date, team |
| `sla_breach_rate` | SLA Breach Rate | PERCENT | `BREACHED cases / evaluated cases` | date, team |
| `backlog` | Backlog | COUNT | `count(state in (NEEDS_HUMAN, HUMAN_ASSIGNED, HUMAN_ACTIVE))`, as of now | team |
| `stock_inquiry_count` | Stock Inquiry Count | COUNT | `count(stock_inquiries created in range)` | date, vendor |
| `vendor_median_response_minutes` | Vendor Median Response Time | MINUTES | `median(closed_at - created_at)` grouped by `primary_source` | date, vendor |
| `vendor_oos_rate` | Vendor OOS Rate | PERCENT | `OUT_OF_STOCK inquiries / vendor inquiries` | date, vendor |
| `commercial_drafts_created` | Commercial Drafts Created | COUNT | `count(commercial_drafts created in range)` | date, type |
| `draft_to_order_conversion` | Draft-to-Order Conversion | PERCENT | `executed SO drafts / (drafts where status not in (DRAFT, CANCELLED))` | date |
| `sales_order_value` | Sales Order Value | IDR | `sum(commercial_drafts.total where type=SALES_ORDER and zoho_object_id is not null)` | date, source |
| `onboarding_completion_rate` | Onboarding Completion Rate | PERCENT | `CUSTOMER_CREATED drafts / onboarding drafts started` | date |
| `attribution_coverage` | Attribution Coverage | PERCENT | `messages with source != UNKNOWN / inbound messages` | date |

## Conventions every metric here follows

- **Safe zero-denominator handling**: every rate is `null` (never `NaN`/`Infinity`) when its denominator is 0 (`lib/analytics/*.ts`'s local `safeRate()` helpers; period-over-period changes go through `lib/analytics/periods.ts`'s `comparePeriods()`, which returns `percentChange: null` under the same condition).
- **Small-sample flagging**: `comparePeriods()` sets `smallSample: true` when both the current and previous values are under 10 — a dashboard or Jarvis tool should present such a comparison as a caveat, never a confident percentage claim.
- **Organization-local time**: every `date`-dimensioned metric resolves its range through `lib/analytics/periods.ts`'s `resolveTimeGrain()`, which uses Asia/Jakarta (UTC+7) day/month boundaries — never raw UTC.
- **`sales_order_value` is Zoho-authoritative**: it is read from `commercial_drafts.total`, which is only populated once a real Zoho Estimate/Sales Order has been created and its confirmed total captured — never a WhatsApp-quoted or estimated figure (brief section 13's explicit prohibition).
- **`vendor_oos_rate` and the stock-domain metrics report rates, never a raw stock quantity** — Phase 3's confidentiality boundary on exact system stock is preserved.
- Metrics not yet in the registry (e.g. a full recommendation-engine confidence score) are computed by `lib/analytics/bottleneck.ts` and `lib/analytics/anomalyDetection.ts` directly rather than registered here, since they are derived insights (FACT/DIAGNOSIS/RECOMMENDATION or threshold-triggered anomalies) rather than a single named KPI value.
