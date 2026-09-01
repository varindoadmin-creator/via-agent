-- VIA Phase 13, brief sections 6, 9, 35: a durable, Supabase-table-backed job
-- queue and dead-letter store — deliberately not a new infrastructure
-- dependency (no Redis, no Cloud Tasks, no broker), matching the explicit
-- prior decision in docs/jarvis-deployment-scalability-continuous-improvement.md
-- ("do not add queues, caches, or workers until measured need demonstrates
-- it"). This is the same cron-sweep-claims-a-Supabase-row shape every other
-- durable workflow in this codebase already uses (commercial_approvals,
-- proactive_customer_actions), scoped to exactly two real use cases — see
-- lib/jobs/queue.ts and docs/reliability.md.

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',

  job_type text not null,
  payload jsonb not null default '{}'::jsonb,

  status text not null default 'PENDING' check (status in (
    'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD', 'RESOLVED'
  )),

  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,

  -- Mirrors every other dedupe-key convention in this codebase
  -- (operational_findings.dedupe_key, proactive_customer_actions.dedupe_key,
  -- analytics_events.dedupe_key) — the caller's own stable reference, so a
  -- retried enqueue call is a no-op rather than a second job.
  idempotency_key text not null,

  resolution_note text,

  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists background_jobs_idempotency_key_idx
  on public.background_jobs (idempotency_key);
create index if not exists background_jobs_claim_idx
  on public.background_jobs (job_type, status, next_attempt_at);
create index if not exists background_jobs_dead_idx
  on public.background_jobs (status, created_at desc) where status = 'DEAD';

alter table public.background_jobs enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
