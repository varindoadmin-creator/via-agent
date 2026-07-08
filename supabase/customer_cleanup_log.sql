create table if not exists public.customer_cleanup_log (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null unique,
  contact_name text,
  changes jsonb not null default '[]'::jsonb,
  fixed_at timestamptz not null default now()
);

create index if not exists customer_cleanup_log_contact_id_idx
  on public.customer_cleanup_log (contact_id);
