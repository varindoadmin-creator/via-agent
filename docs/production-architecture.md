# VIA Production Architecture

## The real system, as it exists today

VIA is a single Next.js application deployed to Cloud Run (`https://via-601025884976.asia-southeast2.run.app`). There is no separate backend service, no message broker, no cache layer, and no distributed job queue infrastructure (no Redis, no Cloud Tasks, no Pub/Sub). This is a deliberate, previously-documented decision (`docs/jarvis-deployment-scalability-continuous-improvement.md`: "do not add queues, caches, or workers until measured latency, concurrency, or quota data demonstrates need") — Phase 13 respects it rather than reversing it.

```text
WATI (WhatsApp)  ──POST──▶  /api/integrations/wati/webhook  ──▶  lib/integrations/wati/pipeline.ts
                                                                        │
                                                                        ├─▶ Zoho Books (customers, items, orders, invoices)
                                                                        ├─▶ Supabase REST (durable state)
                                                                        └─▶ WATI send API (outbound reply)

Browser (admin/director)  ──▶  Next.js API routes (/api/requests/*, /api/jarvis/*)  ──▶  same Zoho/Supabase dependencies

cron-job.org  ──POST + x-cron-secret──▶  app/api/*/sweep routes  ──▶  Supabase + Zoho (batch/background work)
```

- **Compute**: Cloud Run, stateless request handling. No in-process state survives between requests except the process-local circuit breaker (`lib/jarvis/reliability/circuitBreaker.ts`), run-concurrency guard (`lib/jarvis/reliability/runGuard.ts` via `JARVIS_MAX_CONCURRENT_RUNS`), and the new rate limiter (`lib/security/rateLimit.ts`) — all three are explicitly per-instance, not global, because there is no shared store to coordinate them across instances. A multi-instance deployment gets N independent copies of each; this is an accepted tradeoff at VIA's actual traffic (see `docs/reliability.md`), not an oversight.
- **Durable state**: Supabase, accessed exclusively through its REST API (`lib/supabase/rest.ts` and several hand-rolled equivalents) — the application never opens a direct Postgres connection or runs raw SQL from request handlers. Every durable workflow (commercial approvals, proactive customer actions, operational findings, and — new this phase — background jobs) uses the same shape: an `id`, a `version` column for optimistic concurrency, and a unique `dedupe_key`/`idempotency_key` column.
- **Accounting/customer source of truth**: Zoho Books, via `lib/zoho/client.ts` and its retry wrapper (`lib/zoho/retry.ts`). VIA never maintains its own parallel copy of prices, stock, or customer master data — every governed metric and Jarvis tool reads Zoho live or reads a VIA table that only records VIA's own workflow state (drafts, inquiries, findings), never a cached copy of Zoho's own numbers.
- **Messaging**: WATI's WhatsApp Business API, inbound via webhook, outbound via `lib/integrations/wati/client.ts`'s `sendWatiText`/`sendWatiDocument`, always through the disclosure gate (`lib/security/disclosure/disclosureGate.ts`'s `sendWatiTextGated`).
- **AI**: OpenAI, via `@openai/agents`, routed by `lib/jarvis/models/router.ts`. Jarvis is a single agent (never a swarm), internal-only by construction (its tool registry is never imported by the WATI pipeline).
- **Scheduling**: External cron (cron-job.org / Hostinger hPanel), authenticated by a shared `x-cron-secret` header checked in `middleware.ts`. There is no in-application scheduler.

## What Phase 13 adds

- `lib/jobs/` — a Supabase-table-backed durable job queue and dead-letter queue (`background_jobs`), used for exactly two concrete retry paths (proactive-outreach sends, salesperson-assignment writes). See `docs/reliability.md` section C.
- `lib/security/rateLimit.ts` — in-memory, per-instance rate limiting on the login and Jarvis chat endpoints.
- `lib/jarvis/models/usageLog.ts` / `costDashboard.ts` — durable persistence and summarization of model token/cost data that previously only reached Cloud Run's stdout logs.
- `lib/customerIdentity/rolloutFlag.ts` — deterministic percentage-based rollout for one real call site (Phase 11's automatic commercial outreach).
- `lib/reliability/tiers.ts` — a plain classification of business functions by failure cost, used to reason about alert severity.
- `/requests/wati/system-health` — one admin page combining dependency status, recent scheduled-job outcomes, the dead-letter queue, and (director-only) model cost.

## Non-negotiable already true by construction

**Jarvis cannot self-modify business rules.** There is no tool in `lib/jarvis/tools/registry.ts` that writes code, prompts, pricing rules, or permission policy — every write tool targets a specific, narrow business record (a Sales Order preview approval, a proactive action's status, an operational finding's lifecycle, a management decision/experiment record). Changing a prompt, a pricing formula, or the permission model requires a human-authored code change and a new deployment; Jarvis has no path to do either.

## See also

- `docs/reliability.md` — failure modes, retries, idempotency.
- `docs/model-routing.md` — model selection and cost.
- `docs/deployment.md` — release process and cron registration.
- `docs/disaster-recovery.md` — RPO/RTO and backup posture.
- `docs/observability.md` — logging and correlation IDs.
- `docs/evaluation-release-gates.md` — release-blocking checks.
