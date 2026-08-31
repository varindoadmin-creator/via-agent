-- VIA Customer Operations Phase 9, brief sections 2-6: a lightweight,
-- additive canonical event table used ONLY for funnel-stage transitions that
-- no existing Phase 2-8 table durably captures as a single fact. Everything
-- else (stock/vendor timing, SLA, onboarding funnel, revenue) is computed
-- directly from the existing tables, which already are the reliable
-- canonical source for their own domain -- duplicating them here would
-- itself violate the brief's own "do not create duplicate event streams"
-- instruction.
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',
  event_type text not null,

  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),

  conversation_id text,
  customer_id text,
  product_id text,
  inquiry_id text,
  draft_id text,
  order_id text,

  source text,
  channel text,
  actor_type text,
  team_id text,

  properties jsonb,
  schema_version integer not null default 1,

  -- Idempotency key (brief section 5): "<eventType>:<sourceId>", unique so a
  -- duplicate WATI webhook or a retried write can never double-count.
  dedupe_key text not null
);

create unique index if not exists analytics_events_dedupe_key_idx on public.analytics_events (dedupe_key);
create index if not exists analytics_events_type_time_idx on public.analytics_events (event_type, occurred_at desc);
create index if not exists analytics_events_conversation_idx on public.analytics_events (conversation_id);
create index if not exists analytics_events_customer_idx on public.analytics_events (customer_id);

alter table public.analytics_events enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
