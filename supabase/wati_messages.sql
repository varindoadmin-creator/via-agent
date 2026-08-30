-- One row per inbound WATI/WhatsApp message (VIA Customer Operations Phase 2).
-- Idempotency mirrors webhook_events.sql: UNIQUE(provider, provider_message_id),
-- upserted with resolution=ignore-duplicates so a WATI retry never reprocesses.
create table if not exists public.wati_messages (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',
  channel text not null default 'WHATSAPP',
  provider text not null default 'WATI',

  provider_message_id text not null,
  provider_conversation_id text,

  direction text not null default 'INBOUND' check (direction in ('INBOUND', 'OUTBOUND')),
  message_type text not null default 'TEXT',
  text text,
  raw_payload jsonb not null default '{}'::jsonb,

  customer_phone_raw text,
  customer_phone_normalized text,
  customer_name text,

  provider_timestamp timestamptz,
  received_at timestamptz not null default now(),
  processing_status text not null default 'RECEIVED',

  source text,                       -- WEBSITE | GOOGLE_ADS | DIRECT_WHATSAPP | UNKNOWN
  customer_resolution text,          -- MATCHED | UNMATCHED | AMBIGUOUS
  customer_id text,                  -- Zoho contact_id when MATCHED

  intent text,                       -- GREETING | PRODUCT_INQUIRY | STOCK_CHECK | ... | UNKNOWN
  product_resolution text,           -- EXACT | AMBIGUOUS | NOT_FOUND
  item_id text,
  item_code text,
  brand text,
  product_name text,
  requested_quantity numeric,
  requested_unit text,

  response_type text,                -- which response-decision case (A-F) fired, if any

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wati_messages_provider_message_idx
  on public.wati_messages (provider, provider_message_id);

create index if not exists wati_messages_phone_received_idx
  on public.wati_messages (customer_phone_normalized, received_at desc);

create index if not exists wati_messages_received_at_idx
  on public.wati_messages (received_at desc);

alter table public.wati_messages enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
