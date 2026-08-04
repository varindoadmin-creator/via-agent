create table if not exists public.mirpo_recommendation_drafts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'local_draft' check (status in ('local_draft', 'creating_zoho', 'zoho_draft_created', 'failed', 'accepted', 'excluded')),
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
  zoho_purchaseorder_number text,
  zoho_created_at timestamptz,
  zoho_error text
);

create index if not exists mirpo_recommendation_drafts_created_idx
  on public.mirpo_recommendation_drafts (created_at desc);

create unique index if not exists mirpo_recommendation_drafts_zoho_po_idx
  on public.mirpo_recommendation_drafts (zoho_purchaseorder_id)
  where zoho_purchaseorder_id is not null;
