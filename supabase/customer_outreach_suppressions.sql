-- VIA Customer Operations Phase 11, brief section 15: durable opt-out /
-- suppression record. A customer's negative reply is never treated as a
-- global opt-out by default (brief's explicit "do not treat every negative
-- reply as global opt-out") — lib/proactiveActions/suppression.ts classifies
-- the specific scope (ALL vs MARKETING/SALES_FOLLOW_UP only) before writing
-- a row here.

create table if not exists public.customer_outreach_suppressions (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',

  customer_phone_normalized text not null,
  scope text not null check (scope in ('ALL', 'MARKETING', 'SALES_FOLLOW_UP')),

  reason text,
  source_text text,

  created_at timestamptz not null default now()
);

create index if not exists customer_outreach_suppressions_phone_idx
  on public.customer_outreach_suppressions (customer_phone_normalized, scope);

alter table public.customer_outreach_suppressions enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
