-- VIA Customer Operations Phase 6, brief section 9: a durable New Customer
-- Onboarding draft. Jarvis collects fields conversationally over multiple
-- WhatsApp turns into this row; nothing here writes to Zoho -- that only
-- happens via commercial_approvals + CustomerService.createApprovedCustomer()
-- after explicit internal approval (brief section 11).
create table if not exists public.customer_drafts (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',
  source text not null default 'WATI' check (source = 'WATI'),

  normalized_phone text not null,
  wati_contact_id text,
  conversation_id text,

  company_name text,
  contact_person_name text,
  email text,

  needs_faktur_pajak boolean,
  npwp text,

  billing_address jsonb,
  shipping_address jsonb,

  duplicate_check_status text
    check (duplicate_check_status in ('NO_DUPLICATE', 'LIKELY_DUPLICATE', 'AMBIGUOUS')),
  duplicate_candidate_customer_ids text[],

  status text not null default 'COLLECTING_COMPANY' check (status in (
    'COLLECTING_COMPANY', 'COLLECTING_TAX_REQUIREMENT', 'COLLECTING_NPWP',
    'COLLECTING_BILLING_ADDRESS', 'COLLECTING_SHIPPING_ADDRESS',
    'POSSIBLE_DUPLICATE', 'READY_FOR_REVIEW', 'WAITING_FOR_APPROVAL',
    'APPROVED', 'CREATING_ZOHO_CUSTOMER', 'CUSTOMER_CREATED', 'FAILED', 'CANCELLED'
  )),

  created_customer_id text,

  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_drafts_phone_idx
  on public.customer_drafts (normalized_phone, created_at desc);

create index if not exists customer_drafts_status_idx
  on public.customer_drafts (status, created_at desc);

alter table public.customer_drafts enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
