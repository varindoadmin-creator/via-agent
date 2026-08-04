create table if not exists public.mirpo_recommendation_drafts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'local_draft' check (status in ('local_draft', 'accepted', 'excluded')),
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null,
  updated_by text not null,
  configuration jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  adjustments jsonb not null default '{}'::jsonb,
  exclusions jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  estimated_total numeric not null default 0,
  zoho_purchaseorder_id text,
  constraint local_draft_does_not_create_zoho check (zoho_purchaseorder_id is null)
);

create index if not exists mirpo_recommendation_drafts_created_idx
  on public.mirpo_recommendation_drafts (created_at desc);
