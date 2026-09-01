# VIA Observability

## What actually exists

VIA has no distributed tracing or APM system. **Cloud Run's own structured logging is the only observability surface.** Every log line is a single `console.info`/`console.warn`/`console.error` call with a JSON payload, tagged with a `[module.event]`-style prefix (e.g. `[wati.pipeline]`, `[jarvis.run]`, `[proactiveActions.auditLog]`, `[jobs.queue]`) so log lines can be filtered by subsystem in Cloud Logging. This is a deliberate, existing convention (used consistently since Phase 2), not something Phase 13 introduces — this document names it explicitly rather than implying tracing exists where it does not.

## Correlation IDs in use

| ID | Carried by | Purpose |
|---|---|---|
| `requestId` | Every Jarvis run (`JarvisRunContext.requestId`), the WATI webhook route (generated per request) | Ties together every log line and security event for one inbound HTTP request or one Jarvis turn |
| `conversationId` | `JarvisRunContext.conversationId` (Jarvis chat), and — for WATI — the customer's normalized phone number doubles as the conversation identifier throughout `lib/integrations/wati/pipeline.ts` | Ties together every message/tool-call/send within one logical conversation |
| `customerId` | Zoho contact ID, threaded through `proactive_customer_actions.customer_id`, `analytics_events.customer_id`, commercial draft records | Ties a workflow row back to the authoritative Zoho customer, never a free-text name |
| `providerMessageId` / `inboundMessageId` | `wati_messages.provider_message_id` — the durable idempotency key for inbound WATI messages | Deduplicates a retried webhook |
| `runId` | `JarvisOrchestrationTrace.runId`, now also `jarvis_model_usage_log.run_id` | Ties one Jarvis agent run's tool calls, routing decision, and (new this phase) cost/token record together |
| `jobId` | New this phase — `background_jobs.id`, logged in every `[jobs.queue]`/`[jobs.deadLetter]` event | Ties a background-job's enqueue, claim, retry, and terminal-state log lines together |

There is no `workflowId` distinct from the above — a "workflow" in VIA is always one of: a commercial draft (`commercial_drafts.id`), a proactive action (`proactive_customer_actions.id`), an operational finding (`operational_findings.id`), or now a background job (`background_jobs.id`) — each already has its own stable ID that serves this purpose; introducing a fifth, parallel `workflowId` concept would only create a second name for the same thing.

## What is deliberately never logged

Every structured-logging call site in this codebase omits: customer names/phone numbers in bulk, raw message text, Zoho API tokens, Supabase service-role keys, OpenAI API keys, and full request/response bodies for authenticated calls. `lib/jarvis/security/events.ts`'s own comment states the discipline explicitly: "Deliberately omit customer data, tool input, secrets, and document text." This phase's own new log sites (`[jobs.queue]`, `[jobs.deadLetter]`) follow the same rule — a DLQ payload summary (`lib/jobs/deadLetter.ts`'s `safePayloadSummary`) truncates every field to 60 characters and never dumps a raw payload.

## Business vs. technical metrics — where they actually live today

There is no metrics/APM backend (no Datadog, no Prometheus, no Cloud Monitoring custom metrics) — "metrics" in VIA today means: (a) structured log lines an operator can filter/count in Cloud Logging, and (b) durable Supabase tables an admin page or Jarvis tool can query directly. Concretely:

- **Inbound processing latency / auto-response latency**: logged per-message in `[wati.pipeline]` events; not aggregated into a dashboard.
- **WATI/Zoho failure rate**: visible via `cron_run_log` (every sweep's success/failure) and the circuit breaker's own state (process-local, not exported anywhere queryable).
- **Pricing failure, stock workflow age, human-queue backlog**: already surfaced by existing Phase 9/10 dashboards (`/requests/wati/analytics`, `/requests/wati/operational-intelligence`).
- **Proactive action failures**: `proactive_customer_actions.status = 'FAILED'` rows, visible at `/requests/wati/sales-opportunities`.
- **Queue lag / DLQ size**: new this phase, `/requests/wati/system-health`.
- **Model latency/token cost**: new this phase, `jarvis_model_usage_log` (see `docs/model-routing.md`).
- **HTTP error rate, memory/CPU, cold starts**: Cloud Run's own built-in metrics (console-only; not surfaced inside VIA).

Building a real metrics/APM backend is not attempted this phase — it would be new infrastructure, contrary to the explicit "do not add infrastructure until measured need demonstrates it" decision this codebase has stated since Phase 9's deployment doc.
