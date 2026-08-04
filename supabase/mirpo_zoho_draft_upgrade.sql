alter table public.mirpo_recommendation_drafts
  drop constraint if exists local_draft_does_not_create_zoho;

alter table public.mirpo_recommendation_drafts
  drop constraint if exists mirpo_recommendation_drafts_status_check;

alter table public.mirpo_recommendation_drafts
  add column if not exists zoho_purchaseorder_number text,
  add column if not exists zoho_created_at timestamptz,
  add column if not exists zoho_error text;

alter table public.mirpo_recommendation_drafts
  add constraint mirpo_recommendation_drafts_status_check
  check (status in ('local_draft', 'creating_zoho', 'zoho_draft_created', 'failed', 'accepted', 'excluded'));

create unique index if not exists mirpo_recommendation_drafts_zoho_po_idx
  on public.mirpo_recommendation_drafts (zoho_purchaseorder_id)
  where zoho_purchaseorder_id is not null;
