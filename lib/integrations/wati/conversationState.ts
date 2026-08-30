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
