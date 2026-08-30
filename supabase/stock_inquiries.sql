-- Structured pending stock inquiry (VIA Customer Operations Phase 2, brief
-- section 24). Deliberately minimal for this phase: status is always RECEIVED.
-- No EDL/TAK contact, no inventory check, no SLA tracking here — that's Phase 3.
create table if not exists public.stock_inquiries (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',
  customer_id text,
  conversation_id text not null,
  inbound_message_id uuid references public.wati_messages(id),

  item_id text,
  item_code text,
  brand text,

  requested_quantity numeric,
  requested_unit text,

  status text not null default 'RECEIVED' check (status = 'RECEIVED'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_inquiries_conversation_idx
  on public.stock_inquiries (conversation_id, created_at desc);

create index if not exists stock_inquiries_created_at_idx
  on public.stock_inquiries (created_at desc);

alter table public.stock_inquiries enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
