create table if not exists public.leads_status (
  lead_id text primary key,
  stage text not null default 'New',
  notes text not null default '',
  updated_at timestamptz not null default now()
);
