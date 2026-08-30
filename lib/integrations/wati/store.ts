// ─── WATI message persistence ──────────────────────────────────────────────────
// Same idempotency mechanism as lib/whatsapp/eventStore.ts: a Supabase upsert
// with resolution=ignore-duplicates backed by a UNIQUE(provider, provider_message_id)
// index (supabase/wati_messages.sql), so a WATI webhook retry never reprocesses
// the same message or sends a duplicate reply.

import type { NormalizedWatiMessage } from './message.ts';
import { normalizePhoneKey } from '../../customers/phoneKey.ts';

const TABLE = 'wati_messages';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error('WATI message storage is not configured.');
  return { url: `${base}/rest/v1/${TABLE}`, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export interface WatiMessageResolution {
  customerResolution?: 'MATCHED' | 'UNMATCHED' | 'AMBIGUOUS';
  customerId?: string | null;
  source?: string | null;
  intent?: string | null;
  productResolution?: 'EXACT' | 'AMBIGUOUS' | 'NOT_FOUND' | null;
  itemId?: string | null;
  itemCode?: string | null;
  brand?: string | null;
  productName?: string | null;
  requestedQuantity?: number | null;
  requestedUnit?: string | null;
  responseType?: string | null;
  processingStatus?: string;
}

export type WatiStoreResult =
  | { outcome: 'recorded'; id: string; customerPhoneNormalized: string | null }
  | { outcome: 'duplicate'; id: null; customerPhoneNormalized: null };

/**
 * Idempotency gate (brief section 3) — inserts only the identity/raw fields
 * and returns immediately. Must run BEFORE any customer/intent/product
 * resolution or outbound send, so a WATI retry never re-runs that work or
 * sends a duplicate reply. Call `updateWatiMessageResolution` afterwards once
 * the pipeline has actually processed a 'recorded' message.
 */
export async function reserveWatiMessage(message: NormalizedWatiMessage): Promise<WatiStoreResult> {
  const db = database();
  const customerPhoneNormalized = message.customerPhoneRaw ? normalizePhoneKey(message.customerPhoneRaw) : null;

  const body = {
    channel: message.channel,
    provider: message.provider,
    provider_message_id: message.providerMessageId,
    provider_conversation_id: message.providerConversationId,
    direction: message.direction,
    message_type: message.messageType,
    text: message.text,
    raw_payload: message.raw,
    customer_phone_raw: message.customerPhoneRaw,
    customer_phone_normalized: customerPhoneNormalized,
    customer_name: message.customerName,
    provider_timestamp: message.providerTimestamp ? message.providerTimestamp.toISOString() : null,
    received_at: new Date().toISOString(),
    processing_status: 'RECEIVED',
  };

  const response = await fetch(`${db.url}?on_conflict=provider,provider_message_id`, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Unable to record WATI message (${response.status}).`);
  const rows = await response.json() as Array<{ id: string }>;
  return rows.length
    ? { outcome: 'recorded', id: rows[0].id, customerPhoneNormalized }
    : { outcome: 'duplicate', id: null, customerPhoneNormalized: null };
}

/** Fills in the resolution fields once the pipeline has actually processed a newly-recorded message. */
export async function updateWatiMessageResolution(id: string, resolution: WatiMessageResolution): Promise<void> {
  const db = database();
  const body = {
    processing_status: resolution.processingStatus || 'PROCESSED',
    source: resolution.source ?? null,
    customer_resolution: resolution.customerResolution ?? null,
    customer_id: resolution.customerId ?? null,
    intent: resolution.intent ?? null,
    product_resolution: resolution.productResolution ?? null,
    item_id: resolution.itemId ?? null,
    item_code: resolution.itemCode ?? null,
    brand: resolution.brand ?? null,
    product_name: resolution.productName ?? null,
    requested_quantity: resolution.requestedQuantity ?? null,
    requested_unit: resolution.requestedUnit ?? null,
    response_type: resolution.responseType ?? null,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(`${db.url}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...db.headers, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Unable to update WATI message resolution (${response.status}).`);
}

export interface RecentWatiMessageRow {
  id: string;
  text: string | null;
  intent: string | null;
  item_code: string | null;
  brand: string | null;
  product_name: string | null;
  received_at: string;
}

/** Short conversation-context lookback (brief section 23) — no coalescing/queueing, just recent history. */
export async function fetchRecentWatiMessages(customerPhoneNormalized: string, withinMinutes = 10, limit = 5): Promise<RecentWatiMessageRow[]> {
  const db = database();
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  const params = new URLSearchParams({
    customer_phone_normalized: `eq.${customerPhoneNormalized}`,
    received_at: `gte.${since}`,
    select: 'id,text,intent,item_code,brand,product_name,received_at',
    order: 'received_at.desc',
    limit: String(limit),
  });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to fetch recent WATI messages (${response.status}).`);
  return await response.json() as RecentWatiMessageRow[];
}

/** Cheap abuse safeguard (brief section 29) — count only, no external dependency. */
export async function countRecentWatiMessages(customerPhoneNormalized: string, withinSeconds: number): Promise<number> {
  const db = database();
  const since = new Date(Date.now() - withinSeconds * 1000).toISOString();
  const params = new URLSearchParams({
    customer_phone_normalized: `eq.${customerPhoneNormalized}`,
    received_at: `gte.${since}`,
    select: 'id',
  });
  const response = await fetch(`${db.url}?${params.toString()}`, {
    headers: { ...db.headers, Prefer: 'count=exact' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Unable to count recent WATI messages (${response.status}).`);
  const range = response.headers.get('content-range'); // "0-4/5"
  const total = range?.split('/')[1];
  return total && total !== '*' ? Number(total) : (await response.json() as unknown[]).length;
}
