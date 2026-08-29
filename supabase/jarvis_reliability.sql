-- Apply before setting JARVIS_RELIABILITY_SCHEMA_ENABLED=true.
-- It adds durable identifiers without changing existing pending-action data.
alter table public.jarvis_pending_actions
  add column if not exists idempotency_key text,
  add column if not exists workflow_version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists jarvis_pending_actions_idempotency_key_idx
  on public.jarvis_pending_actions (idempotency_key)
  where idempotency_key is not null;

create index if not exists jarvis_pending_actions_executing_idx
  on public.jarvis_pending_actions (status, approved_at)
  where status = 'executing';
