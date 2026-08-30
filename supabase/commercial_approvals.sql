-- VIA Customer Operations Phase 6, brief sections 12/43: explicit internal
-- approval bound to a draft's exact (id, version, hash) -- the admin-review
-- equivalent of jarvis_pending_actions, but not scoped to a chat
-- conversation/role-claim, since the approver here is Admin reviewing a
-- WATI-originated draft from a dashboard rather than the person who
-- triggered the draft. A material draft edit increments the draft's
-- version, which invalidates any approval bound to the old version
-- (enforced in application code, not by a DB trigger).
create table if not exists public.commercial_approvals (
  id uuid primary key default gen_random_uuid(),

  draft_type text not null check (draft_type in ('CUSTOMER', 'COMMERCIAL')),
  draft_id uuid not null,
  draft_version integer not null,
  draft_hash text not null,

  status text not null default 'PENDING' check (status in (
    'PENDING', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED'
  )),

  requested_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,

  executed_at timestamptz,
  zoho_object_id text,
  zoho_object_number text,
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one live (non-terminal) approval per exact draft version -- a
-- duplicate approval click for the same version finds the existing row
-- instead of creating a race.
create unique index if not exists commercial_approvals_live_draft_version_idx
  on public.commercial_approvals (draft_type, draft_id, draft_version)
  where status in ('PENDING', 'APPROVED', 'EXECUTING');

create index if not exists commercial_approvals_status_idx
  on public.commercial_approvals (status, created_at desc);

alter table public.commercial_approvals enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
