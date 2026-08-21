create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  phone_number_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received',
  payload_json jsonb not null
);

create unique index if not exists webhook_events_provider_external_event_idx
  on public.webhook_events (provider, external_event_id);

create index if not exists webhook_events_received_at_idx
  on public.webhook_events (received_at desc);

alter table public.webhook_events enable row level security;
