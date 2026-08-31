# VIA Customer Operations — Operational Finding Model (Phase 10)

## The `OperationalFinding` shape

`lib/operationalIntelligence/types.ts`'s `OperationalFinding`, backed by the `operational_findings` table — adapted from the brief's §3 shape to this codebase's real conventions: VIA has exactly two shared role accounts (`admin`/`director`), so "assigned user" is `assignedRole`, mirroring Phase 8's `wati_conversation_state.assigned_role`; `Decimal` is `number`, matching every other analytics module.

| Field | Notes |
|---|---|
| `category` | One of 13 values: the brief's 12-minimum plus `COMMERCIAL_OPPORTUNITY`. |
| `severity` / `urgency` | Independent (brief §39) — scored deterministically by `lib/operationalIntelligence/severity.ts`, never by an LLM. |
| `status` | `OPEN → ACKNOWLEDGED → ACTION_PLANNED → IN_PROGRESS → RESOLVED`, or `DISMISSED`/`EXPIRED` at any point. Stored, versioned (optimistic concurrency), fully audited. |
| `evidence` | `FindingEvidence[]` — structured, never invented; every number traces back to a Phase 9 metric call or a direct, narrow table read. |
| `confidence` | `LOW`/`MEDIUM`/`HIGH`, based on sample size and data-quality coverage — never LLM intuition. |
| `dedupeKey` | Unique per issue instance (e.g. `VENDOR_RESPONSE_DETERIORATION:EDL`) — a scheduled run updates the existing row, never creates a duplicate. |
| `consecutiveBreachCount` / `consecutiveNormalCount` | Persistence and recovery bookkeeping, tracked on the row itself — no separate detection-history table. |
| `recurrenceCount` | Incremented when a RESOLVED/DISMISSED finding's dedupe key breaches again — reopened, not duplicated. |
| `lastAlertedAt` | Alert cooldown bookkeeping (brief §62). |

## Lifecycle

```text
OPEN → ACKNOWLEDGED → ACTION_PLANNED → IN_PROGRESS → RESOLVED
  ↑___________________________________________________|  (recurrence: reopens as OPEN, recurrenceCount+1)
                    ↘ DISMISSED (with a reason, at any point before RESOLVED)
```

Creating an action plan (`lib/operationalIntelligence/findingStore.ts`'s `createActionPlan`) also transitions the finding to `ACTION_PLANNED` in the same call — the brief's §42 lifecycle is enforced structurally, not left to the caller to remember.

## Deduplication and update-in-place

`findingStore.ts`'s `upsertFinding()` is the only write path for a detection pass. It looks up the existing row by `dedupeKey`; if none exists, it inserts a new `OPEN` finding; if one exists and is still active, it patches the same row in place (incrementing `consecutiveBreachCount`, never creating a second row); if one exists and is `RESOLVED`/`DISMISSED`/`EXPIRED`, it reopens it as a tracked recurrence. A scheduled sweep running every few minutes therefore never floods the queue — the same condition always maps to the same row.

## Auto-resolution

`recordNormalPass()` is the counterpart call for a rule that currently reports *no* breach. It advances `consecutiveNormalCount`; only once that reaches the rule's configured `persistenceWindows` **and** `AUTO_FINDING_RESOLUTION_ENABLED` is on does the finding move to `RESOLVED` (with `resolvedValue` captured for outcome tracking). With the flag off — the default — the counter still accrues, so turning the flag on later does not require re-observing recovery from zero.

**Documented limitation**: `recordNormalPass` is only called for rules that produce at most one finding (a fixed dedupe key — SLA, backlog, pending-action, approved-not-executed, conversion decline, pricing gap/conflict, Zoho failures, WATI sync health, workflow-stuck, onboarding friction, human-handoff spike, quotation follow-up). Per-entity rules (vendor response/OOS deterioration, high-demand-low-availability, per-reason automation-capability-gap, per-metric data-quality gaps) do not currently auto-recover — they still resolve correctly the moment the *same* entity breaches again (the recurrence path handles that), but reaching `RESOLVED` today requires an explicit human action for those types. Extending auto-recovery to per-entity findings would require tracking the set of currently-known entities across runs; deferred as a documented limitation rather than built speculatively.

## Action plans

`operational_actions` (brief §56) — deliberately minimal: `description`, `ownerRole`/`ownerTeam`, `status` (`TODO`/`IN_PROGRESS`/`DONE`/`CANCELLED`), `dueAt`/`completedAt`. No sub-tasks, no dependencies, no separate project-management surface.

## Outcome tracking

`lib/operationalIntelligence/outcome.ts`'s `getFindingOutcome()` — once a finding is `RESOLVED`, returns `{ beforeValue: currentValue, afterValue: resolvedValue, label: 'post-action change' }`. Deliberately never a causal claim (brief §92) — the label is fixed text, not "improvement due to your action."

## Security

- Every write (`acknowledgeFinding`, `assignFinding`, `createActionPlan`, `resolveFinding`, `dismissFinding`) is optimistic-concurrency versioned and calls `recordFindingEvent()` unconditionally — an audit-log write failure never blocks the transition itself, mirroring `lib/customerService/auditLog.ts`'s exact pattern.
- No finding, no rule, and no Jarvis tool ever writes to Zoho, changes a price, applies a discount, or sends a customer message. Every `recommendedActionType` is drawn from a fixed, controlled taxonomy (brief §51) — free-text recommendations are never executable.
