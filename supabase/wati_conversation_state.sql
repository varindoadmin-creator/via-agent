-- One row per WhatsApp conversation (VIA Customer Operations Phase 2, brief
-- section 21 "human takeover"). A single upserted row lets the webhook check
-- "should VIA auto-respond right now?" with one lookup instead of scanning
-- message history. HUMAN_REQUEST intent or a manual admin action flips this to
-- NEEDS_HUMAN/HUMAN_ACTIVE; while set, VIA records inbound messages but does
-- not send an automated reply.
create table if not exists public.wati_conversation_state (
  customer_phone_normalized text primary key,

  state text not null default 'AUTO' check (state in ('AUTO', 'NEEDS_HUMAN', 'HUMAN_ACTIVE', 'RESOLVED')),

  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.wati_conversation_state enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
