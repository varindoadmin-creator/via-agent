-- Optional and additive. Apply manually before setting
-- JARVIS_FEEDBACK_SCHEMA_ENABLED=true in the same environment.
create table if not exists public.jarvis_feedback (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  conversation_id text not null,
  actor_role text not null,
  feedback_type text not null check (feedback_type in ('helpful', 'not_helpful', 'correction', 'failure')),
  note text,
  release_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists jarvis_feedback_created_at_idx on public.jarvis_feedback (created_at desc);
create index if not exists jarvis_feedback_release_idx on public.jarvis_feedback (release_id, feedback_type);
alter table public.jarvis_feedback enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
