# JARVIS reliability and production engineering

## Audit and architecture

VIA is a Next.js application deployed to Cloud Run. It uses API routes for JARVIS, Zoho Books through `lib/zoho/client.ts`, Supabase REST for durable approval state, and cron-job.org for authenticated scheduled HTTP jobs. It has no Redis, queue, broker, or distributed lock. That is appropriate for the current approval-based write scope: protected writes are short, claim a Supabase row atomically, and do not require a background worker to be safe.

The reliability layer is intentionally centralised in `lib/jarvis/reliability/` and the existing JARVIS tool registry. It covers model runs, tool calls, approval writes, and Zoho HTTP calls without introducing another agent or new production infrastructure.

## Controls

| Control | Behaviour |
| --- | --- |
| Failure taxonomy | `TRANSIENT`, `PERMANENT`, `VALIDATION`, `AUTHORIZATION`, `APPROVAL`, `RATE_LIMIT`, `TIMEOUT`, `DEPENDENCY_UNAVAILABLE`, `CONFLICT`, `STALE_STATE`, `INTERNAL` |
| Overall run | `JARVIS_RUN_TIMEOUT_MS`, default 48 seconds, bounded below Cloud Run's 60-second route limit |
| Concurrency | Per-instance guard, `JARVIS_MAX_CONCURRENT_RUNS`, default 6; excess requests fail safely with `RATE_LIMIT` |
| Tool deadline | Registry metadata: reads 15 seconds, analysis 30 seconds; no scattered tool constants |
| Circuit breaker | Instance-local, opens after three transient dependency failures, then permits one cooldown probe after 30 seconds |
| Zoho read retry | At most two retries for transient network/429/5xx errors, with exponential jitter |
| Zoho writes | Default zero automatic retries for POST/PUT/DELETE. A timeout is an unknown outcome, not a signal to repeat the write |
| Approval writes | Pending approval is atomically claimed before write; only a Director with exact approval can create the SO |
| Recovery | `/api/jarvis/recovery` marks old `executing` actions as manual-reconciliation-required. It never recreates a Zoho record |

The circuit breaker and run guard are deliberately process-local. Cloud Run can run multiple instances, so they reduce pressure and cascading failures rather than acting as a global lock. Supabase remains the durable coordination point for protected actions.

## Idempotency and unknown write outcomes

Sales Order creation is protected by one approval row. Only the pending state can be claimed; a second approval attempt sees a conflict. If Zoho confirms creation but Supabase cannot record completion, the action stays `executing` and VIA tells the user **not to retry**. The recovery job then marks it for manual Zoho verification rather than performing another POST.

Apply [jarvis_reliability.sql](../supabase/jarvis_reliability.sql) in Supabase, then set `JARVIS_RELIABILITY_SCHEMA_ENABLED=true`. This adds a durable `idempotency_key`, workflow version, update timestamp, and a stale-execution index without changing existing action rows. Keep the flag disabled until the SQL has been applied.

Future new write tools must use the same pattern: durable workflow ID/idempotency key, conditional claim, external write with no blind retry, result persistence, and reconciliation for unknown outcomes.

## Dependency fallback

Memory and RAG are already best-effort: an unavailable service is logged and omitted, while JARVIS continues with verified tools. Tool failures return a structured safe error; JARVIS must not fabricate a result. Model or Zoho failure returns a clear error and preserves all records. No automatic write fallback exists.

## Operations and rollout

1. Deploy this application change.
2. Apply `supabase/jarvis_reliability.sql`.
3. Set `JARVIS_RELIABILITY_SCHEMA_ENABLED=true` and redeploy.
4. Add a cron-job.org POST for `/api/jarvis/recovery` every 15 minutes with `x-cron-secret`. This job only marks stale actions for reconciliation; it does not mutate Zoho.
5. Monitor `GET /api/jarvis/health`. It exposes configuration readiness without exposing secrets or reading/writing business data.

Recommended feature flags: `JARVIS_MAX_CONCURRENT_RUNS`, `JARVIS_RUN_TIMEOUT_MS`, `JARVIS_ACTION_STALE_MINUTES`, `JARVIS_RELIABILITY_SCHEMA_ENABLED`. A rollback is a normal Cloud Run revision rollback; disable the schema flag before rolling back code that does not understand the added fields.

## Safe-behaviour demonstrations

| Case | Expected outcome |
| --- | --- |
| A. Zoho timeout | `TIMEOUT`, safe message, no retry for write |
| B. Zoho 500 | bounded retry for reads, circuit opens after repeated failure |
| C. Model failure | bounded run ends safely; no record changed |
| D. Tool timeout | timed structured failure; remaining evidence can still be used |
| E. RAG/memory unavailable | retrieval omitted, JARVIS continues without claiming it succeeded |
| F. Duplicate approval | only one conditional claim can proceed |
| G. Concurrent request | per-instance run guard rejects excess work safely |
| H. Stale workflow | recovery marks manual reconciliation; no external retry |
| I. Rate limit | `RATE_LIMIT`, jittered bounded read retry, then stop |
| J. Partial data | tool returns evidence/warnings rather than fabricated completion |
