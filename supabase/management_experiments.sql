-- VIA Phase 12, brief section 36: controlled management experiment records
-- (e.g. "change quotation follow-up timing") — before/after values, sample
-- sizes, and a conclusion that can never be set to SUCCESS/FAILURE below the
-- minimum sample size (enforced in lib/metrics/experimentStore.ts, not just
-- documented here).

create table if not exists public.management_experiments (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',

  name text not null,
  hypothesis text not null,
  metric_id text not null,

  started_at timestamptz not null default now(),
  ended_at timestamptz,

  before_value numeric,
  before_sample_size integer not null default 0,
  after_value numeric,
  after_sample_size integer not null default 0,

  status text not null default 'RUNNING' check (status in ('RUNNING', 'INSUFFICIENT_DATA', 'CONCLUDED')),
  conclusion text check (conclusion in ('IMPROVED', 'NO_CHANGE', 'WORSENED')),
  conclusion_notes text,

  created_by text not null check (created_by in ('admin', 'director')),

  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists management_experiments_status_idx
  on public.management_experiments (status, metric_id);

alter table public.management_experiments enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
