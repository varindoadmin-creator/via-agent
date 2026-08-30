-- VIA Customer Operations Phase 7, brief section 4: once a customer account
-- is selected within a conversation, later self-service questions in the
-- same conversation reuse it without re-asking. Additive ALTER, safe to
-- re-run.
alter table public.wati_conversation_state
  add column if not exists active_customer_id text,
  add column if not exists active_customer_selected_at timestamptz,
  -- Set when a self-service question needed an account selection first (Phase
  -- 6 mapping resolved to MANY) — lets the customer's next reply ("1" / a
  -- company name) resume the original question instead of being reclassified
  -- as a fresh, unrelated intent.
  add column if not exists pending_self_service_intent text,
  add column if not exists pending_self_service_ref text;
