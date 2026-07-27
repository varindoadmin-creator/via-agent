create table if not exists public.cron_run_log (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('success', 'failed')),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists cron_run_log_job_finished_idx
  on public.cron_run_log (job_name, finished_at desc);
