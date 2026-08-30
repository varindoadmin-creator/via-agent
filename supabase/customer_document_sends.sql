-- VIA Customer Operations Phase 7, brief section 44: outbound-document audit
-- trail. A duplicate webhook never reaches this (the wati_messages
-- UNIQUE(provider, provider_message_id) idempotency gate stops reprocessing
-- before this table is ever touched) -- this table exists to make every
-- actual send auditable, not to provide its own dedupe mechanism.
create table if not exists public.customer_document_sends (
  id uuid primary key default gen_random_uuid(),

  customer_id text not null,
  document_type text not null check (document_type in ('INVOICE_PDF')),
  document_id text not null,

  conversation_id text,
  wati_message_id uuid references public.wati_messages(id),

  sent_at timestamptz not null default now(),
  sent_by text not null default 'VIA' check (sent_by in ('VIA', 'HUMAN'))
);

create index if not exists customer_document_sends_customer_idx
  on public.customer_document_sends (customer_id, sent_at desc);

alter table public.customer_document_sends enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
