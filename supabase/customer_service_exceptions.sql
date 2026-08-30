-- VIA Customer Operations Phase 7, brief section 45: the Customer Service
-- exception queue. Normal self-service traffic never writes a row here --
-- only the cases that couldn't go straight-through.
create table if not exists public.customer_service_exceptions (
  id uuid primary key default gen_random_uuid(),

  conversation_id text,
  customer_id text,

  category text not null,
  reason text,

  status text not null default 'NEEDS_HUMAN' check (status in (
    'NEEDS_IDENTITY', 'NEEDS_HUMAN', 'PAYMENT_REVIEW', 'DELIVERY_CHECK',
    'DOCUMENT_SEND_FAILED', 'ZOHO_UNAVAILABLE', 'RESOLVED'
  )),

  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists customer_service_exceptions_status_idx
  on public.customer_service_exceptions (status, created_at desc);

alter table public.customer_service_exceptions enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
