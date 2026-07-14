create table if not exists public.lead_customer_marks (
  id uuid primary key default gen_random_uuid(),
  lead_key text not null unique,
  name text,
  phone text,
  marked_at timestamptz not null default now()
);

create index if not exists lead_customer_marks_lead_key_idx
  on public.lead_customer_marks (lead_key);
