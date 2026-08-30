-- VIA Customer Operations Phase 6, brief section 20: tracks WATI contact
-- sync attempts per mapping so failures are visible/retryable from the
-- admin dashboard without VIA ever needing to re-derive sync state. Sync
-- failure never blocks/rolls back a valid Zoho customer or mapping (brief
-- section 61).
create table if not exists public.wati_contact_sync_log (
  id uuid primary key default gen_random_uuid(),

  customer_channel_identity_id uuid not null references public.customer_channel_identities(id) on delete cascade,

  status text not null default 'SYNC_PENDING'
    check (status in ('SYNC_PENDING', 'SYNCED', 'SYNC_FAILED_RETRYABLE', 'SYNC_FAILED_FINAL')),

  synced_fields jsonb,
  error text,

  attempted_at timestamptz not null default now(),
  synced_at timestamptz
);

create index if not exists wati_contact_sync_log_identity_idx
  on public.wati_contact_sync_log (customer_channel_identity_id, attempted_at desc);

create index if not exists wati_contact_sync_log_status_idx
  on public.wati_contact_sync_log (status, attempted_at desc);

alter table public.wati_contact_sync_log enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
