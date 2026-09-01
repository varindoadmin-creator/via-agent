# VIA Disaster Recovery

## Scale context

VIA is a single-company internal operations system for one distributor (Varindo), not a multi-tenant SaaS product. The RPO/RTO targets below are sized for that reality — a few hours of acceptable data loss and a same-business-day restore are reasonable for an internal tool backed by an accounting system (Zoho Books) that remains the durable source of truth for every financial fact regardless of VIA's own availability. Do not read these numbers as appropriate for a customer-facing SaaS product; they are not.

## Recovery targets

| Component | RPO (acceptable data loss) | RTO (acceptable downtime) | Rationale |
|---|---|---|---|
| Zoho Books (customers, items, orders, invoices, payments) | N/A — Zoho's own backup/DR posture applies, outside VIA's control | N/A | VIA never holds the authoritative copy of this data; it always reads Zoho live |
| Supabase (VIA's own workflow state: drafts, approvals, findings, proactive actions, background jobs) | A few hours | Same business day | This state is operationally important (in-flight workflows) but not financially authoritative — the worst case of losing recent rows is re-detecting/re-processing already-observed conditions, not losing money |
| Cloud Run application | Minutes (stateless — redeploy from the last known-good commit) | Minutes | No local state to lose; redeploying the same container image restores full functionality immediately |
| WATI conversation history | Whatever WATI itself retains | N/A | VIA does not treat WATI as its own backup of conversation history — `wati_messages` is VIA's own durable copy of what it has processed |

## Supabase backup — what can and cannot be verified from this codebase

This codebase cannot verify Supabase's actual backup configuration — that is a Supabase project setting, not application code. **Action required outside this repository**: confirm in the Supabase project dashboard that:
1. Point-in-time recovery (PITR) or daily backups are enabled for the production project.
2. A restore has actually been tested at least once (an untested backup is not a verified recovery capability — brief section 39's own instruction).
3. The backup retention window matches the RPO above.

If none of this has been done, the honest current state is: **Supabase backup/restore capability is unverified.** Treat this as an open operational task, not a resolved one.

## Restore procedure (application-level)

1. **Cloud Run**: redeploy the last known-good revision (Cloud Run retains prior revisions; this is a console/CLI action, not a code change).
2. **Supabase**: restore from the provider's backup/PITR mechanism (see above — this is a Supabase-console action). After restore, run `GET /api/jarvis/health` and `GET /api/jarvis/recovery`-adjacent checks (the recovery endpoint itself only reconciles stale `executing` approvals — it is not a full-system health check) to confirm the application can reach Supabase and Zoho again.
3. **Reconciliation**: any commercial-approval row left in `executing` state across the restore window must be manually verified against Zoho before being touched again — never assume its outcome and never retry it automatically (this is the existing, unchanged non-negotiable from `docs/jarvis-reliability-production-engineering.md`).
4. **Background jobs**: any `background_jobs` row lost in a restore is not itself a data-loss event of consequence — both current job types (`wati_send_retry`, `salesperson_assign_retry`) are re-derivable: the next sweep of the underlying subsystem (a proactive-action sweep, a salesperson-map sync) will naturally re-detect the same condition and re-enqueue if it's still unresolved.

## Critical external dependencies and degraded behavior

| Dependency | If it's down | VIA's behavior |
|---|---|---|
| Zoho Books | All price/stock/order/payment lookups fail | Jarvis and the WATI pipeline both return a stated "cannot verify right now" response — see `docs/reliability.md` and the Zoho-outage eval case (`REG-TIMEOUT-001`). No price, stock, or order is ever fabricated. |
| WATI | Inbound webhooks stop arriving; outbound sends fail | Inbound: nothing VIA can do — WATI is the only inbound channel. Outbound: `sendWatiText` returns `'failed'`/`'disabled'` rather than throwing; proactive sends get durably retried via the Phase 13 job queue rather than silently dropped. |
| OpenAI (Jarvis's model) | Jarvis chat fails | `app/api/jarvis/chat/route.ts`'s catch-all returns a safe, reference-numbered error. Deterministic paths (product-code lookup, price lookup, policy answers in the WATI pipeline) do not depend on the LLM at all and continue working. |
| Supabase | Every durable-state read/write fails | Best-effort side channels (analytics events, audit logs) degrade silently and are logged; critical-path writes (approvals, commercial drafts) fail loudly rather than proceeding without a durable record. |
