-- VIA Customer Operations Phase 6, brief section 4: the authoritative
-- WhatsApp <-> Zoho Customer mapping. VIA owns this; WATI tags and Jarvis
-- long-term memory are never used to solve this. A single normalized phone
-- may have zero, one, or many active rows (one per linked Zoho customer) --
-- see brief section 5's one-vs-many resolution rules.
create table if not exists public.customer_channel_identities (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',

  channel text not null default 'WHATSAPP' check (channel = 'WHATSAPP'),
  provider text not null default 'WATI' check (provider = 'WATI'),

  normalized_phone text not null,
  wati_contact_id text,

  customer_id text not null,

  relationship_status text not null default 'UNVERIFIED'
    check (relationship_status in ('VERIFIED', 'UNVERIFIED', 'DISABLED')),

  source text not null
    check (source in ('CUSTOMER_CONFIRMED', 'ADMIN_CONFIRMED', 'ZOHO_CONTACT_MATCH', 'IMPORTED', 'ONBOARDING_CREATED')),

  verified_at timestamptz,
  verified_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A phone may map to the same customer at most once while active. Disabled
-- rows are excluded so a corrected mapping can be re-created without
-- deleting the audit trail of the disabled one (brief section 21: every
-- change is audited, not erased).
create unique index if not exists customer_channel_identities_active_phone_customer_idx
  on public.customer_channel_identities (normalized_phone, customer_id)
  where relationship_status != 'DISABLED';

create index if not exists customer_channel_identities_phone_idx
  on public.customer_channel_identities (normalized_phone)
  where relationship_status != 'DISABLED';

alter table public.customer_channel_identities enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
