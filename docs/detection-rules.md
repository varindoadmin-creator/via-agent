# VIA Customer Operations — Detection Rules (Phase 10)

Every rule below lives in `lib/operationalIntelligence/rules/`, is configured in `lib/operationalIntelligence/detectionRules.ts`'s `DETECTION_RULES` array, and reads only Phase 9 governed metrics or one narrowly-scoped existing table — never a duplicate calculation, never raw message scanning.

| Rule key | Category | Reads | Finding type(s) |
|---|---|---|---|
| `CUSTOMER_SERVICE_SLA_DETERIORATION` | CUSTOMER_SERVICE | `getCustomerServiceFunnel` (current vs. previous period) | `CUSTOMER_SERVICE_SLA_DETERIORATION` |
| `CUSTOMER_SERVICE_BACKLOG_RISK` | CUSTOMER_SERVICE | `wati_conversation_state` (point-in-time open/unassigned counts, oldest-case age) | `CUSTOMER_SERVICE_BACKLOG_RISK` |
| `PENDING_ACTION_AT_RISK` | CUSTOMER_SERVICE | `wati_conversation_state` + `stock_inquiries` (unassigned-too-long, vendor-responded-but-no-activity-since) | `PENDING_ACTION_AT_RISK` |
| `APPROVED_TRANSACTION_NOT_EXECUTED` | ORDER_PROCESSING | `commercial_drafts` (APPROVED/EXECUTING past threshold) | `APPROVED_TRANSACTION_NOT_EXECUTED` |
| `VENDOR_RESPONSE_DETERIORATION` / `VENDOR_OOS_DETERIORATION` | VENDOR | `getVendorPerformance` (per vendor, current vs. previous period) | one finding per breaching vendor, dedupe-keyed `TYPE:VENDOR` |
| `HIGH_DEMAND_LOW_AVAILABILITY` | PRODUCT | `stock_inquiries` grouped by `item_code` | one finding per breaching product code |
| `CONVERSION_DECLINE` | CONVERSION | `getCommercialFunnel` (current vs. previous period) | `CONVERSION_DECLINE` |
| `PRICING_COVERAGE_GAP` / `PRICING_SOURCE_CONFLICT` | PRICING | `wati_messages.response_type` / `wati_conversation_state.handoff_reason` | `PRICING_COVERAGE_GAP`, `PRICING_SOURCE_CONFLICT` |
| `AUTOMATION_CAPABILITY_GAP` | CUSTOMER_SERVICE | `getHandoffReasonBreakdown` (capability-gap reasons only) | one finding per breaching reason |
| `ZOHO_WRITE_FAILURES` | SYSTEM_RELIABILITY | `commercial_approvals` | `ZOHO_WRITE_FAILURES` |
| `WATI_CONTACT_SYNC_HEALTH` | SYSTEM_RELIABILITY | `wati_contact_sync_log` | `WATI_CONTACT_SYNC_HEALTH` |
| `WORKFLOW_STUCK` | SYSTEM_RELIABILITY | `commercial_drafts` + `customer_drafts` (in-flight states past threshold) | `WORKFLOW_STUCK` |
| `CUSTOMER_ONBOARDING_FRICTION` | CUSTOMER_ONBOARDING | `getOnboardingFunnel` | `CUSTOMER_ONBOARDING_FRICTION` |
| `DATA_QUALITY_GAP` | DATA_QUALITY | `getDataQualityCoverage` | `ATTRIBUTION_COVERAGE_GAP`, `CUSTOMER_MAPPING_GAP`, `ORDER_LINKAGE_GAP` |
| `HUMAN_HANDOFF_SPIKE` | CUSTOMER_SERVICE | `getCustomerServiceFunnel` + `getHandoffReasonBreakdown` | `HUMAN_HANDOFF_SPIKE` |
| `QUOTATION_FOLLOW_UP_OPPORTUNITY` | COMMERCIAL_OPPORTUNITY | `commercial_drafts` (QUOTATION idle past threshold) | `QUOTATION_FOLLOW_UP_OPPORTUNITY` |

## Threshold model

Every rule shares one evaluation function, `detectionRules.ts`'s `evaluateThreshold(rule, value)`: `value` is always a non-negative measure of severity (a count, a rate, or a fractional decline/increase); `breaches` is true at or above `warningThreshold`; `magnitude` is normalized 0-1 between `warningThreshold` and `criticalThreshold`. This keeps `lib/operationalIntelligence/severity.ts`'s scoring function unit-agnostic — it never needs to know whether a rule measures minutes, a rate, or a raw count.

## Baselines (brief §34 — never one baseline for everything)

- **Previous equivalent period**: `lib/analytics/periods.ts`'s `previousPeriod()` — used by every trend rule (SLA, vendor, conversion, handoff spike).
- **Configured/absolute target**: point-in-time rules (backlog, pending-action, approved-not-executed, workflow-stuck, quotation follow-up, pricing coverage/conflict, capability gap, Zoho/WATI reliability, data-quality gaps) compare against a fixed threshold — there is no historical series to compare against for a live snapshot count.
- **Trailing multi-day window**: `lib/operationalIntelligence/baseline.ts`'s `trailing7DayWindow`/`trailing30DayWindow` are available for a future rule that needs one; none of the 14 shipped rules currently uses this baseline type, since a previous-equivalent-period comparison was sufficient for all of them.

## Sample size and persistence protection

`lib/operationalIntelligence/samplingGuards.ts`: `hasSufficientSample()` (default minimum 10, overridable per rule via `OPERATIONAL_<KEY>_MIN_SAMPLE`) gates every rate-based rule before it can even produce a candidate. `hasPersisted()` gates whether a *newly detected* candidate reaches full severity or an alert-eligible state — most rules require 2 consecutive breaching detection passes (`OPERATIONAL_<KEY>_PERSISTENCE`, default 2) before `severity.ts` stops applying its "not yet persisted" discount; a few point-in-time safety-relevant rules (`APPROVED_TRANSACTION_NOT_EXECUTED`, `ZOHO_WRITE_FAILURES`, `PENDING_ACTION_AT_RISK`, `WORKFLOW_STUCK`) are configured for immediate alerting (`defaultPersistenceWindows: 1`) since waiting out a noise window on an already-stuck transaction would itself be harmful.

## Cadence

`app/api/wati/operational/sweep` runs the four cheap, point-in-time rules (backlog, pending-action-at-risk, approved-not-executed, workflow-stuck) on every invocation. The remaining ten period-comparison/aggregate rules run only once per Jakarta calendar day, gated by checking `cron_run_log` for a prior successful run today with `summary.includedDailyRules: true` — no new scheduler, reusing the existing cron-heartbeat table.

## Cooldown

`detectionEngine.ts`'s `shouldAlert()`: an alert only fires for a `HIGH`/`CRITICAL`, persisted finding, and only if it has never been alerted before or `cooldownMinutes` (default 240, overridable per rule) has elapsed since `lastAlertedAt`. A finding that keeps breaching on every 5-minute sweep therefore emails at most once every 4 hours by default, not once per sweep.
