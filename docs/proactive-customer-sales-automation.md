# VIA Customer Operations — Phase 11 (Proactive Customer & Sales Automation, Follow-Up, Reorder Opportunities & Approved Outreach)

## The core loop

```text
Operational Data (commercial_drafts, requests, wati_conversation_state, Zoho Sales Orders)
        ↓
Detector (lib/proactiveActions/detectors/*.ts) — deterministic, never Jarvis
        ↓
ProactiveCustomerAction (proactive_customer_actions, deduplicated in place)
        ↓
Approval policy (AUTO_ALLOWED / REQUIRES_REVIEW / PROHIBITED — lib/proactiveActions/approvalPolicy.ts)
        ↓
Human review (Sales Opportunities queue) — only for REQUIRES_REVIEW
        ↓
Outbound eligibility (human-active check, opt-out, cooldown — lib/proactiveActions/eligibility.ts)
        ↓
Fact re-resolution (customer active, quotation number — never trusted from detection time)
        ↓
WATI send via sendWatiTextGated, or an internal task for Sales/Ops
        ↓
Outcome tracking (SENT → CUSTOMER_RESPONDED / CONVERTED / EXPIRED)
```

**The one rule that shaped every design decision in this phase**: detection and recommendation are always deterministic; only wording is ever templated, and only after every fact in that wording (customer name, product name, quotation number) was already fixed by a database read — never by Jarvis. Jarvis is only ever handed an already-computed, already-eligible action and asked to narrate, list, or transition it (approve/assign/dismiss) through the same tool-call surface Phase 10 established. No detector, tool, or template ever states a price, a stock level, a Tier, or a delivery date — outreach that needs one directs the customer back into the existing Phase 3/5 live-lookup flow instead of asserting a value proactively.

## A. Existing architecture reused

- `lib/customerIdentity/featureFlags.ts` — the exact staged-rollout flag pattern (env-var getter, one arrow function per flag) every phase since Phase 6 has used; Phase 11 adds one comment block of its own flags rather than a new file.
- `lib/operationalIntelligence/findingStore.ts`'s upsert/versioning/audit shape — `lib/proactiveActions/store.ts` mirrors it field-for-field (`version`-based optimistic concurrency, `recordActionEvent` before every table write, an audit-log failure never blocking the transition).
- `lib/supabase/rest.ts` (`supabaseSelect`/`supabaseInsert`/`supabasePatch`) for every new table.
- `lib/analytics/events.ts`'s `recordAnalyticsEvent` — extended with the ten `proactive_action.*`/`outbound.*` event types this phase needs, not a second event pipeline.
- `lib/integrations/wati/conversationState.ts`'s `getConversationState` for the human-active check (Phase 8's exact `NEEDS_HUMAN`/`HUMAN_ASSIGNED`/`HUMAN_ACTIVE` triple, reused verbatim).
- `lib/security/disclosure/disclosureGate.ts`'s `sendWatiTextGated` — every proactive WhatsApp send goes through the same disclosure gate every other outbound message uses.
- `lib/integrations/wati/pricing/customerSafePrice.ts`'s `getCustomerSafePrice` and `lib/commercialApprovals/executeCommercialDraft.ts`'s "revalidate everything immediately before the write" discipline — `sendOutreach.ts` re-fetches customer/item/draft facts immediately before every send rather than trusting what a detector saw hours earlier.
- `lib/customerIdentity/channelIdentity.ts`'s `resolveCustomerIdentities`, `lib/companyKnowledge/brandRelationships.ts`'s `BRAND_RELATIONSHIPS` (catalogue URLs), `lib/customerService/handoffReasons.ts`'s `ServiceTeam` enum shape (inlined, not imported, matching how `operationalIntelligence/types.ts` already does this), `lib/cron/runLog.ts` + the `app/api/wati/*/sweep` cron pattern + its `middleware.ts` `CRON_PATHS` registration, `lib/jarvis/tools/registry.ts`'s `read`/`analyze`/`write` internal-tool factories.

## B. Proactive action model

`ProactiveCustomerAction` (`lib/proactiveActions/types.ts`, table `proactive_customer_actions`) follows the brief's shape with the same "assigned role/team, not assigned user" adaptation Phase 10 made for `OperationalFinding` (VIA has no per-user directory). Ten `ProactiveActionType` values, eleven `ProactiveActionStatus` values exactly as specified, plus `channel` (`WHATSAPP` | `INTERNAL_TASK`) and `messageCategory` (the four-way `SERVICE_MESSAGE`/`TRANSACTIONAL_MESSAGE`/`SALES_FOLLOW_UP`/`MARKETING_MESSAGE` split section 13 requires). `dedupeKey` is unique-indexed exactly like `operational_findings.dedupe_key`; `upsertAction()` inserts once, refreshes evidence in place on a repeat detection while still `DETECTED`/`REVIEW_REQUIRED`, and — this is the one deliberate difference from Phase 10 — **never reopens** an action that is in-flight (`APPROVED`→`CUSTOMER_RESPONDED`) or terminal (`CONVERTED`/`DISMISSED`/`EXPIRED`/`FAILED`/`CANCELLED`). A human dismissal or an already-sent message is never silently clobbered by the next sweep; a genuinely new instance of the same opportunity type gets its own dedupe key instead (e.g. quotation follow-up's two stages are two separate rows, `reorder`/`dormant` candidates are keyed per calendar month).

## C. Eligibility policy

`lib/proactiveActions/eligibility.ts`'s `evaluateOutboundEligibility()` is the `OutboundEligibilityService` the brief asks for, called from exactly one place — immediately before send (`sendOutreach.ts`), never at detection time. It checks, in order: human-active conversation state (blocks unconditionally), suppression scope for the message's category (`lib/proactiveActions/suppression.ts`), and — for `SALES_FOLLOW_UP`/`MARKETING_MESSAGE` only — a configurable cross-detector cooldown (`lib/proactiveActions/frequency.ts`, `PROACTIVE_CONTACT_COOLDOWN_HOURS`, default 72h) so independent detectors can never bombard the same customer. `SERVICE_MESSAGE`/`TRANSACTIONAL_MESSAGE` are exempt from both the cooldown and the narrower suppression scopes (an inquiry justifies service follow-up even after a promo opt-out, per brief section 13).

**Documented gap vs. the brief's full section 14**: no WATI template/conversation-window API exists anywhere in this codebase (confirmed by audit) — VIA's WATI integration has always been free-form `sendWatiText`, never template-gated. This phase does not invent a template system; the eligibility service covers everything VIA can actually enforce today (human ownership, consent, frequency) and documents the template/window gap as pre-existing, not new.

## D. Follow-up detectors

All in `lib/proactiveActions/detectors/`, each a pure `async () => ProactiveActionCandidate[]` function reading Supabase/Zoho directly (no LLM call in any detector):

- **`quotationFollowUp.ts`** — per-quotation (not aggregate — Phase 10's existing `QUOTATION_FOLLOW_UP_OPPORTUNITY` finding is untouched), two bounded stages (`INITIAL_FOLLOW_UP` at 48h, `FINAL_FOLLOW_UP` at +120h, both env-configurable), stage 2 only created once stage 1 was actually sent. "Converted" is approximated as a completed `SALES_ORDER` draft for the same customer created after the quotation — `commercial_drafts` has no direct quotation→order link field, documented as a known limitation.
- **`orderIntentFollowUp.ts`** — `detectOrderIntentFollowUp` (drafts stuck in `NEEDS_QUANTITY`/`NEEDS_DELIVERY_INFO`/`NEEDS_CUSTOMER`, a genuinely customer-pending next step) and `detectInactiveCommercialDrafts` (bare `DRAFT` stuck long enough that the context is too ambiguous for a customer message — becomes an `INTERNAL_TASK` for Sales instead, per brief section 20). `NEEDS_PRICE`/`WAITING_STOCK` are intentionally excluded — those are Sales/vendor-owned next steps, not customer-owned.
- **`sampleRequestFollowUp.ts`** — an unprocessed request past its window becomes an Operations internal task; a *completed* sample for a phone that resolves to exactly one known customer, with no commercial draft since, becomes one Sales follow-up recommendation. A phone matching `MANY` or `UNKNOWN` customers is never guessed.
- **`reorderOpportunity.ts`** — requires ≥3 historical Sales Orders of the same canonical Zoho item (never text similarity) via the new `lib/zoho/purchaseHistory.ts`, and checks the item is still `active` in Zoho before ever recommending it. Always `REQUIRES_REVIEW` (enforced in `approvalPolicy.ts`, not just left to a flag). Cost-bounded: since Zoho's Sales Order list endpoint doesn't return line items, this reads full order detail per candidate order, so it only evaluates a small, staleness-rotated batch of customers (those with an assigned salesperson) per run, gated to once per Jakarta day.
- **`dormantCustomer.ts`** — dormancy = an assigned-salesperson customer with no completed `commercial_drafts` activity in a configurable window (default 180 days), never "no WhatsApp message." **Documented limitation**: this only sees VIA-originated deals, not full Zoho order history, so a customer who reorders through a channel VIA never touches (phone, walk-in) can appear falsely dormant — scanning full Zoho history per customer was judged too expensive to run automatically, same cost tradeoff as the reorder detector.
- **`serviceRecovery.ts`** — resolved Phase 8 cases whose resolution time exceeded the existing `CS_SLA_BREACH_MINUTES` threshold; a factual apology only, never compensation. (Phase 10's own SLA finding is aggregate, with no per-case/customer link to message from, so this reads `wati_conversation_state` directly instead.)
- **`callback.ts`** — not a sweep detector; `createCustomerCallback()` is called on demand (via the new `record_customer_callback` Jarvis tool) the moment a customer explicitly asks for one, and only ever creates an internal task — it never pretends the call happened.

**Declared but not built this pass**: `APPROVED_CAMPAIGN_OUTREACH` exists in the type taxonomy (section 4 requires it) and in `approvalPolicy.ts` (always `REQUIRES_REVIEW`), but no detector or campaign object model is built — section 32's `campaignId`/audience-definition/start-end/frequency scaffold is a genuinely separate feature or two beyond this phase's scope, and building an unused campaign UI would violate "do not build uncontrolled mass messaging" more than deferring it does.

## E. Consent / suppression

`lib/proactiveActions/suppression.ts` — `detectOptOutIntent()` is a fixed keyword classifier (never an LLM judgment) with two scopes: a broad phrase ("stop", "berhenti", "tidak mau dihubungi") suppresses everything proactive; a narrower phrase ("jangan kirim promo") suppresses only `MARKETING`/`SALES_FOLLOW_UP`. An ordinary negative reply ("harganya mahal") is never classified as opt-out. Wired into `lib/integrations/wati/pipeline.ts` as a single `void checkInboundForOptOut(...)` call — best-effort, never awaited, never affects the current turn's own response. Suppression rows live in the new `customer_outreach_suppressions` table and are checked by `eligibility.ts` on every send, never bypassed.

## F. Approval levels

`lib/proactiveActions/approvalPolicy.ts`'s `approvalLevelForAction(type, channel)`:

| Type | Level |
|---|---|
| Any `INTERNAL_TASK` | `AUTO_ALLOWED` (never reaches the customer) |
| `CUSTOMER_CALLBACK` | `AUTO_ALLOWED` (task only) |
| `ORDER_INTENT_FOLLOW_UP`, `NEEDS_INFORMATION_FOLLOW_UP` | `AUTO_ALLOWED` iff `AUTO_SERVICE_FOLLOWUP_ENABLED`, else `REQUIRES_REVIEW` |
| `QUOTATION_FOLLOW_UP` | `AUTO_ALLOWED` iff `AUTO_COMMERCIAL_OUTREACH_ENABLED`, else `REQUIRES_REVIEW` |
| `REORDER_OPPORTUNITY`, `DORMANT_CUSTOMER_REENGAGEMENT`, `SERVICE_RECOVERY`, `SAMPLE_REQUEST_FOLLOW_UP` (conversion path), `APPROVED_CAMPAIGN_OUTREACH` | always `REQUIRES_REVIEW` — no flag unlocks auto-send |

Review flow (`PREPARE → approve → revalidate → SEND`): `approveAction()` only flips status/records who approved; `sendOutreach.ts` re-checks eligibility and re-resolves every fact from scratch immediately before sending, so a fact that changed between approval and send (customer went inactive, a human took the conversation over) blocks the send without needing the approval itself to be invalidated.

## G. WATI integration

`lib/proactiveActions/sendOutreach.ts`'s `sendProactiveOutreach(actionId)` is the only path from an action to an actual send: phone resolution (action's own phone, or a reverse lookup via `customer_channel_identities`) → customer-active check → eligibility → fact re-resolution → template (`messageContent.ts`, deterministic Bahasa Indonesia, per-type) → `sendWatiTextGated`. A `version`-mismatch on the post-send `markSent` PATCH (two workers racing the same action) is treated as `DUPLICATE_PREVENTED`, not an error — the optimistic-concurrency column doubles as the outbound idempotency guard the brief's section 18/44 asks for. A transient WATI failure or `WATI_API_TOKEN` not being configured leaves the action sendable for the next sweep rather than permanently failing it; a disclosure-gate block or a real policy suppression (opt-out) does permanently fail it.

## H. Sales Opportunities UI

`/requests/wati/sales-opportunities` (+ `GET /api/requests/wati/sales-opportunities`, and `POST .../[id]/{approve,dismiss,assign,cancel,send-now}`) — nine views (`Needs Review`, `Follow Up Today`, `Reorder Opportunities`, `Quotation Follow-Ups`, `Sample Leads`, `Dormant Customers`, `Sent`, `Converted`, `Dismissed`), client-filtered over one list response, matching the existing `/requests/wati/operational-intelligence` page's pairing convention exactly. Seven new internal-only Jarvis tools (`lib/jarvis/tools/proactiveActions.ts`, registered in `registry.ts`/`catalog.ts`) mirror the same actions for Jarvis-assisted review — structurally unreachable from the WATI pipeline, the same "the pipeline never imports this registry" guarantee Phase 9/10 rely on.

## I. Analytics

Ten new `AnalyticsEventType` values (`proactive_action.detected/approved/sent/suppressed/responded/converted/expired`, `outbound.eligibility_denied/optout_detected/duplicate_prevented`) recorded through the existing `recordAnalyticsEvent()` pipeline, gated by the existing `ANALYTICS_EVENT_PIPELINE_ENABLED` flag — no second event stream. `detected`/`approved`/`responded`/`converted`/`expired` are emitted from `store.ts`'s own transitions (the single source of truth for state changes); `sent`/`suppressed`/the two `outbound.*` events are emitted from `sendOutreach.ts` at the point they're actually known. **Not built this pass**: a dedicated dashboard section (conversion-rate-after-follow-up, opt-out rate, etc.) — the events exist for `AnalyticsMetricService` to aggregate in a future pass, matching how Phase 9's own dashboard was scoped incrementally.

## J. Tests

`lib/proactiveActions/*.test.ts` (24 tests, `node --experimental-strip-types --test`, `npm run test:proactive-actions`): store upsert/dedupe/version-conflict/no-resurrection-after-dismissal (brief tests 37-38, 44), eligibility's human-active/opt-out/cooldown gates (tests 39-40), message-content's no-Tier/no-stale-price-claim/no-fabricated-expiry/no-invented-cadence checks (tests 41-42, section 6, section 28), and approval-policy's hardcoded `REQUIRES_REVIEW` for reorder/dormant regardless of flags (test 9, section 26). Full existing `test:wati-inquiry`, `test:commercial-approvals`, and `test:jarvis` suites re-run with zero regressions — the two highest-risk changes (the one-line opt-out hook in `pipeline.ts` and the `analytics_events`/`featureFlags.ts` type-union extensions) were the ones most likely to regress prior phases.

**Not built this pass**: dedicated per-detector unit tests (each detector is a thin, direct Supabase/Zoho query — the policy/safety layer they all funnel through is what's tested) and an end-to-end sweep integration test.

## K. Risks / unresolved policy

- **No WATI template/conversation-window enforcement exists** (section C) — this is a pre-existing gap in VIA's WATI integration, not something Phase 11 could close without a verified WATI capability that doesn't exist in this codebase today (mirrors Phase 8's identical documented gap for operator/assignment sync).
- **Dormant-customer and reorder detection only see VIA-originated Zoho activity** — a customer who orders through untracked channels can look falsely dormant or falsely "due for reorder." Both detectors are `REQUIRES_REVIEW` specifically so a human catches this before any message goes out.
- **Quotation "converted" is inferred, not linked** — `commercial_drafts` has no quotation→order foreign key; the heuristic (any completed Sales Order for the same customer after the quotation) could occasionally mis-attribute an unrelated order as the quotation's conversion. Acceptable for outcome-tracking purposes, not for anything financial.
- **Reorder/dormant detectors are Zoho-call-heavy** (no line-item data on Zoho's list endpoint forces per-order detail reads) — deliberately batch-limited and daily-gated; a larger customer base will need either a purpose-built Zoho report or a longer detection cycle, not a naive limit increase.
- **`CUSTOMER_RESPONDED` is never set automatically** — nothing in this pass re-classifies an inbound reply as "the customer responded to this specific proactive action" (that would require correlating an arbitrary inbound message back to a specific outbound send, a nontrivial conversation-threading problem). `markCustomerResponded()` exists in the store for a future pass; today a human (or the next detection pass finding a resolved next-step) is what actually closes these out.
- **`APPROVED_CAMPAIGN_OUTREACH` has no concrete implementation** (see D) — declared in the taxonomy and locked to `REQUIRES_REVIEW`, but campaign creation, audience segmentation, and content approval are not built.

## Feature flags (all off by default)

`PROACTIVE_ACTIONS_ENABLED` (master switch — the cron sweep no-ops entirely while off), `QUOTATION_FOLLOWUP_ENABLED`, `REORDER_OPPORTUNITIES_ENABLED`, `SAMPLE_FOLLOWUP_ENABLED`, `DORMANT_CUSTOMER_ENABLED`, `AUTO_SERVICE_FOLLOWUP_ENABLED`, `AUTO_COMMERCIAL_OUTREACH_ENABLED` — matching the brief's exact section 48 list. Commercial/dormant/reorder auto-send is never unlocked by one of these alone; see F.

## Rollout stages (brief section 49)

1. **Internal opportunities only** — turn on `PROACTIVE_ACTIONS_ENABLED` alone: order-intent/inactive-draft/sample/service-recovery detectors run and populate the Sales Opportunities queue; nothing auto-sends (everything customer-facing defaults to `REQUIRES_REVIEW`).
2. **Service follow-ups** — add `AUTO_SERVICE_FOLLOWUP_ENABLED` once queue review confirms the wording/cadence looks right.
3. **Quotation follow-up with approval** — add `QUOTATION_FOLLOWUP_ENABLED` (detection only; still reviewed).
4. **Controlled auto quotation follow-up** — add `AUTO_COMMERCIAL_OUTREACH_ENABLED`.
5. **Reorder opportunities with approval** — add `REORDER_OPPORTUNITIES_ENABLED`/`DORMANT_CUSTOMER_ENABLED` (always reviewed, per F, regardless of any flag).
6. **Approved outbound campaigns** — not built this pass (see K).
