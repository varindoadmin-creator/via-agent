// ─── WATI conversation state ────────────────────────────────────────────────────
// One row per conversation (supabase/wati_conversation_state.sql). Brief section
// 21: once a conversation is NEEDS_HUMAN/HUMAN_ACTIVE, VIA still records inbound
// messages but must not send further automated replies.

export type WatiConversationState = 'AUTO' | 'NEEDS_HUMAN' | 'HUMAN_ACTIVE' | 'RESOLVED';

const TABLE = 'wati_conversation_state';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error('WATI conversation state storage is not configured.');
  return { url: `${base}/rest/v1/${TABLE}`, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export async function getConversationState(customerPhoneNormalized: string): Promise<WatiConversationState> {
  const db = database();
  const params = new URLSearchParams({
    customer_phone_normalized: `eq.${customerPhoneNormalized}`,
    select: 'state',
  });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to read WATI conversation state (${response.status}).`);
  const rows = await response.json() as Array<{ state: WatiConversationState }>;
  return rows[0]?.state ?? 'AUTO';
}

/** Upserts the conversation row, advancing state only when `nextState` is provided. */
export async function touchConversationState(customerPhoneNormalized: string, nextState?: WatiConversationState): Promise<void> {
  const db = database();
  const now = new Date().toISOString();
  const body: Record<string, unknown> = {
    customer_phone_normalized: customerPhoneNormalized,
    last_inbound_at: now,
    updated_at: now,
  };
  if (nextState) body.state = nextState;
  const response = await fetch(`${db.url}?on_conflict=customer_phone_normalized`, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Unable to update WATI conversation state (${response.status}).`);
}

/**
 * Brief section 4: once a customer account is selected within a
 * conversation, later self-service questions reuse it without re-asking.
 * Brief section 37: switching accounts mid-conversation is explicit and
 * audited (the console.info here), never a silent blend of two customers'
 * data.
 */
export async function getActiveCustomerId(customerPhoneNormalized: string): Promise<string | null> {
  const db = database();
  const params = new URLSearchParams({
    customer_phone_normalized: `eq.${customerPhoneNormalized}`,
    select: 'active_customer_id',
  });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to read active customer context (${response.status}).`);
  const rows = await response.json() as Array<{ active_customer_id: string | null }>;
  return rows[0]?.active_customer_id ?? null;
}

export interface PendingSelfService {
  intent: string;
  ref: string | null;
}

/** Set when a self-service question needed an account selection first (Phase 6 mapping resolved to MANY) — lets the customer's next reply resume the original question. */
export async function getPendingSelfService(customerPhoneNormalized: string): Promise<PendingSelfService | null> {
  const db = database();
  const params = new URLSearchParams({
    customer_phone_normalized: `eq.${customerPhoneNormalized}`,
    select: 'pending_self_service_intent,pending_self_service_ref',
  });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to read pending self-service context (${response.status}).`);
  const rows = await response.json() as Array<{ pending_self_service_intent: string | null; pending_self_service_ref: string | null }>;
  const row = rows[0];
  return row?.pending_self_service_intent ? { intent: row.pending_self_service_intent, ref: row.pending_self_service_ref } : null;
}

export async function setPendingSelfService(customerPhoneNormalized: string, pending: PendingSelfService | null): Promise<void> {
  const db = database();
  const response = await fetch(`${db.url}?on_conflict=customer_phone_normalized`, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      customer_phone_normalized: customerPhoneNormalized,
      pending_self_service_intent: pending?.intent ?? null,
      pending_self_service_ref: pending?.ref ?? null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`Unable to set pending self-service context (${response.status}).`);
}

export async function setActiveCustomerId(customerPhoneNormalized: string, customerId: string): Promise<void> {
  const db = database();
  const now = new Date().toISOString();
  console.info('[wati.conversationState]', JSON.stringify({ event: 'active_customer_set', phoneKey: customerPhoneNormalized, customerId }));
  const response = await fetch(`${db.url}?on_conflict=customer_phone_normalized`, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      customer_phone_normalized: customerPhoneNormalized,
      active_customer_id: customerId,
      active_customer_selected_at: now,
      updated_at: now,
    }),
  });
  if (!response.ok) throw new Error(`Unable to set active customer context (${response.status}).`);
}
