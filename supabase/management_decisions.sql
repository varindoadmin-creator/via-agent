-- VIA Phase 12, brief section 35: DecisionRecord — when management acts on a
-- finding/brief, this durably records what was decided so an outcome can be
-- compared later. Deliberately minimal, same "not a project-management
-- system" scoping as Phase 10's operational_actions table. `linked_finding_*`
-- is a loose reference (not a foreign key) because a decision may be linked
-- to an operational_findings row, a proactive_customer_actions row, or
-- nothing formal at all — never assume the table.

create table if not exists public.management_decisions (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',

  decision text not null,
  rationale text not null,

  linked_finding_type text check (linked_finding_type in ('OPERATIONAL_FINDING', 'PROACTIVE_ACTION', 'OTHER')),
  linked_finding_id text,
  linked_finding_description text,

  decided_by text not null check (decided_by in ('admin', 'director')),
  decided_at timestamptz not null default now(),

  expected_outcome text not null,
  review_date date not null,

  status text not null default 'PENDING_REVIEW' check (status in ('PENDING_REVIEW', 'REVIEWED')),
  actual_outcome text,
  reviewed_by text check (reviewed_by in ('admin', 'director')),
  reviewed_at timestamptz,

  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists management_decisions_status_review_idx
  on public.management_decisions (status, review_date);
create index if not exists management_decisions_linked_finding_idx
  on public.management_decisions (linked_finding_type, linked_finding_id);

alter table public.management_decisions enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
