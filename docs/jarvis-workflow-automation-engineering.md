# JARVIS Workflow & Automation Engineering

## V1 boundary

JARVIS remains the one agent. The workflow engine owns durable state; the model only reasons inside an allowed step. V1 supports inspectable definitions, versioned instances, optimistic state transitions, IANA-timezone schedules, normalized events, durable step history, event de-duplication, and bounded automation policy. It does not introduce a second scheduler or autonomous Zoho writes.

## Existing infrastructure reused

- External cron-job.org / Cloud scheduler endpoints and `cron_run_log` remain the scheduler/heartbeat source.
- `jarvis_pending_actions` remains the authoritative Sales Order approval + idempotency path.
- JARVIS reliability guards, authorization policy, and tool registry continue to apply to every step.
- Supabase is the durable store. `SupabaseWorkflowRepository` only connects after `supabase/jarvis_workflows.sql` is applied and `JARVIS_WORKFLOW_SCHEMA_ENABLED=true`; this avoids breaking an existing deployment before the migration is present. Its `idempotency_key` unique constraint and expected-status updates prevent duplicate starts and concurrent state changes.

## States and safety

Instances transition only through the central engine: `PENDING → RUNNING → WAITING_FOR_USER|WAITING_FOR_APPROVAL|WAITING_FOR_DEPENDENCY|RETRY_SCHEDULED|COMPLETED|FAILED|CANCELLED`. Waiting approval survives restarts because state is stored outside the LLM. Writes always pause for the existing explicit approval route; scheduler execution never implies approval.

## Available definitions

`sales_order_preparation`, `weekly_sales_review`, `low_stock_review`, and `overdue_receivable_review`. They are versioned definitions with allowed triggers/steps, bounded runtime, and kill switches via `JARVIS_WORKFLOW_<TYPE>_ENABLED=false`.

## Automations

Automation definitions include explicit owner/run-as role, required permissions, timezone, schedule, allowed actions, autonomy level, runtime/entity/model-call budgets, concurrency and missed-run policy. V1 permits only READ, ANALYZE, NOTIFY, and PREPARE, caps model calls at 25 and entities at 500 per run, and is globally off unless `JARVIS_AUTOMATIONS_ENABLED=true`. Creation/enabling must be an authenticated API/UI confirmation, never a side effect of chat.

## Event and notification discipline

Events require a stable ID, organization, entity, source, and timestamp. Persisting event IDs deduplicates duplicate delivery. Use deterministic thresholds to find exceptions, then invoke JARVIS only for bounded findings. A future finding service should suppress repeated condition notifications and preserve NEW/ONGOING/RESOLVED state.

## Operations

Use existing cron health monitoring for schedule misses. A failed dependency results in `WAITING_FOR_DEPENDENCY` or `RETRY_SCHEDULED`; never replay unknown external writes. Automation runs should log workflow ID, scan count, finding count, token usage, estimated cost, and structured failure code only—never hidden reasoning.

## Validation

`npm run test:jarvis` includes workflow transition, event validation, approval-wait recovery, duplicate-trigger/event handling, bounded automation policy, and timezone schedule tests. `npm run eval:jarvis` remains the fixture-only behavioral regression suite.
