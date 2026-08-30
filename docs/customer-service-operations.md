# VIA Customer Operations — Phase 8 (Human Handoff, Customer Service Operations, SLA & Exception Queues)

## Two constraints that shaped this phase

1. **VIA has exactly two shared role accounts (`admin`, `director`), no per-user directory** (`lib/auth.ts`). "Assigned user" is modeled as **assigned role** — "Assign to Me" assigns whichever role is currently logged in. "Teams" are a fixed label enum (`CUSTOMER_SERVICE | SALES | FINANCE | OPERATIONS | MANAGEMENT`) used for routing/filtering, not a membership table.
2. **No verified WATI operator/assignment API exists in this codebase.** Every WATI capability built in Phases 2-7 (`sendWatiText`, `sendWatiDocument`, `updateWatiContactAttributes`) is send-only. This phase builds the explicit VIA-side Take Over / Return to VIA / Resolve mechanism as primary. `WATI_ASSIGNMENT_SYNC_ENABLED` is declared per the brief's flag list but its code path is a **documented no-op** — turning it on does nothing, because there is nothing verified to sync to.

## Service state model

`wati_conversation_state.state` (Phase 2, extended in place rather than a new table — the brief's own instruction):

```text
AUTO -> NEEDS_HUMAN -> HUMAN_ASSIGNED -> HUMAN_ACTIVE -> RESOLVED
                                                       -> CLOSED (from RESOLVED)
      <- reopened -----------------------------------------|
```

`WAITING_CUSTOMER` / `WAITING_INTERNAL` / `WAITING_VENDOR` are **not** persisted states — they're derived, display-only labels (`lib/customerService/waitingState.ts`) computed live from Phase 3's `stock_inquiries`, Phase 6's `commercial_drafts`/`customer_drafts`, and Phase 7's `pending_self_service_intent`. This is deliberate: the brief explicitly forbids a second, duplicate vendor-wait state machine.

## Handoff triggers

The brief's full 22-reason enum (`lib/customerService/handoffReasons.ts`) with a fixed `TEAM_FOR_REASON` routing table — stock/vendor issues → `OPERATIONS`, discount/special-price/large-project → `SALES`, payment issues → `FINANCE`, everything else (including any reason not explicitly mapped) → `CUSTOMER_SERVICE`, the `DEFAULT_CUSTOMER_SERVICE_QUEUE`. No handoff is ever created because "Jarvis feels uncertain" — every trigger site names a specific `HandoffReason`.

`lib/customerService/handoff.ts`'s `triggerHandoff()` is idempotent: while a case is already in an active human state (`NEEDS_HUMAN`/`HUMAN_ASSIGNED`/`HUMAN_ACTIVE`), a second trigger is a no-op — it never resets the SLA clock (`handoff_created_at`), never reassigns, and never re-sends the urgent-handoff email. The primary duplicate-webhook defense remains the existing `wati_messages` idempotency gate (a retried webhook never even reaches `triggerHandoff` twice for the same inbound message); this idempotency check is defense in depth for two distinct real messages both triggering a handoff before an admin has acted.

## Assignment

`lib/customerService/assignment.ts`: `assignToRole` (→ `HUMAN_ASSIGNED`), `assignToTeam` (logged as `service.team_transfer` when it changes an existing team), `leastOpenCasesRole` (a simple open-case count between the two shared roles — no ML, per the brief's own "do not overbuild" instruction). A case that can't be matched to a specific team always lands in `CUSTOMER_SERVICE` — never left unassigned.

## SLA

`lib/customerService/sla.ts`'s `computeCaseSlaStatus`, mirroring `lib/integrations/wati/stock/sla.ts`'s exact shape: env-configurable (`CS_SLA_WARNING_MINUTES`, default 15; `CS_SLA_BREACH_MINUTES`, default 60). The clock runs continuously by default; setting `CS_SLA_PAUSE_OUTSIDE_HOURS=true` makes it pause outside Varindo's own customer-service calendar (`lib/customerService/businessHours.ts` — deliberately separate from `stock/operatingCalendar.ts`'s per-vendor calendars, so the two are never conflated). `app/api/wati/service/sweep` (a `middleware.ts` cron path, same pattern as `app/api/wati/stock/sweep`) computes SLA status for every open case and sends **one bounded summary email** for all current warnings/breaches — never per-case spam.

## Human takeover & suppression

`conversationSuppressed` in `lib/integrations/wati/responseDecision.ts` now covers `NEEDS_HUMAN`, `HUMAN_ASSIGNED`, and `HUMAN_ACTIVE` uniformly — automation does not speak once a human owns the conversation, in any of those three states.

**Race-condition recheck** (brief sections 76-77): immediately before the pipeline's one outbound `sendWatiTextGated` call, `lib/integrations/wati/pipeline.ts` re-fetches the live conversation state. If it has become human-owned since the response was decided — a human took over mid-processing — the automated send is suppressed (`responseCase: 'SUPPRESSED_RACE'`) rather than racing the Admin's own message. This check is skipped only for the exact turn that is itself creating the handoff (e.g. the "we'll connect you to Admin" acknowledgement), so that message isn't wrongly suppressed by the very state change it causes.

## Return to automation

`lib/customerService/caseActions.ts`'s `returnToAuto` makes the transition itself safe (optimistic-concurrency versioned, audited) and preserves all conversation/customer/draft context untouched. The brief's "only if no sensitive/risky workflow remains active" is the **Admin's own judgment** when clicking the button — VIA does not attempt to auto-verify this, a deliberate scoping choice given the complexity of exhaustively checking every possible in-flight workflow.

## Admin queue & actions

`/requests/wati/customer-service` — views `Needs Attention | Unassigned | Waiting Customer | Waiting Internal | Waiting Vendor | SLA Warning | SLA Breached | Resolved`, backed by `GET /api/requests/wati/customer-service/cases`. Actions (`Assign to Me`, `Assign Team`, `Take Over`, `Return to VIA`, `Resolve`, `Reopen`) each call a session-gated `POST /api/requests/wati/customer-service/cases/[phone]/*` route and are fully audited.

## Jarvis Admin copilot

`lib/customerService/copilot.ts` — `summarizeConversation` and `suggestReply`, both internal-only (never customer-facing, gated by `JARVIS_ADMIN_COPILOT_ENABLED`/`SUGGESTED_REPLIES_ENABLED`), built on the same narrow, tool-free `aiCompletion` helper Phase 2's intent classifier already uses — no tool access, ever. Grounded entirely in `lib/customerService/handoffContext.ts`'s `HandoffContext` (already-known product/quantity/draft state, so Sales/Finance never has to re-ask the customer something already captured) and the last few real messages — never invents a missing step. A suggested reply is drafted only; sending it remains a manual Admin action.

## Audit log & observability

`customer_service_audit_log` (new table) + a `console.info` at every write (`lib/customerService/auditLog.ts`), covering handoff creation, assignment/reassignment, takeover, return-to-auto, team transfer, resolve, reopen, SLA warning/breach — the brief's full section 60-61 event list.

## Security

- `HUMAN_ACTIVE` never grants the customer internal data permissions — every outbound message, human or automated, still passes through Phase 4's `sendWatiTextGated` disclosure gate.
- A denied Phase 4 request (e.g. "show me sales Lamitak") is **not** automatically escalated to a human case — brief section 53's explicit "do not necessarily escalate every denied request."
- Internal permission separation is coarse by design (VIA has no finer-grained permission system than admin/director) — assigning a case to `FINANCE` is the actual enforcement mechanism when Finance-only data is needed, not a data-visibility check within the same session.

## Feature flags

`CUSTOMER_SERVICE_HANDOFF_ENABLED` (master switch — off means every hand-off point falls back to today's pre-Phase-8 bare `NEEDS_HUMAN` flip, unchanged), `AUTO_ASSIGNMENT_ENABLED`, `CUSTOMER_SERVICE_SLA_ENABLED`, `SLA_ESCALATION_ENABLED`, `JARVIS_ADMIN_COPILOT_ENABLED`, `SUGGESTED_REPLIES_ENABLED`, `AUTO_RETURN_TO_VIA_ENABLED`, `WATI_ASSIGNMENT_SYNC_ENABLED` (documented no-op, see constraint #2). All off by default.

## Known limitations

- WATI operator/assignment sync — not implemented (no verified capability; see constraint #2).
- Full KPI/analytics dashboard beyond the queue's own live counts — the brief's own framing sends this to Phase 9.
- Workload-aware assignment beyond a simple open-case count.
- Scheduled customer-reminder nudges (brief section 43).
- Escalation beyond two bounded levels (assigned-role SLA email → one audit event per sweep; no automatic manager escalation chain).
- `returnToAuto`'s "no sensitive workflow remains active" check is the Admin's judgment, not machine-verified (see above).

## Tests

`lib/customerService/*.test.ts` — handoff idempotency and reason→team/priority routing, SLA `ON_TIME → WARNING → BREACHED` (continuous and business-hours-paused), derived waiting-state precedence (vendor > internal > customer, never a duplicate state machine), takeover/return/resolve/reopen with optimistic-concurrency conflict handling, assignment and team-transfer auditing, and handoff-context assembly (proving Sales/Finance receives already-known product/quantity). Full existing suite re-run for zero regressions — the two highest-risk changes (the `state` enum extension and the `conversationSuppressed` check) were the ones most likely to regress prior phases and are covered by the existing `test:wati-inquiry`/`test:security-disclosure` suites passing unchanged.
