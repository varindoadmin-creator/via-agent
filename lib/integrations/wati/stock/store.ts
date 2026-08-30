// ─── Stock workflow persistence ─────────────────────────────────────────────────
// Data access for stock_inquiries (Phase 3 columns), stock_check_requests, and
// their join table. Follows the same Supabase-REST-via-fetch pattern as
// lib/integrations/wati/store.ts.

function database(table: string) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error(`Stock ${table} storage is not configured.`);
  return { url: `${base}/rest/v1/${table}`, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export interface StockInquiryRow {
  id: string;
  customer_id: string | null;
  conversation_id: string;
  customer_phone_raw: string | null;
  inbound_message_id: string;
  item_id: string | null;
  item_code: string | null;
  brand: string | null;
  requested_quantity: number | null;
  requested_unit: string | null;
  status: string;
  stock_inquiry_type: string | null;
  primary_source: string | null;
  active_stock_check_request_id: string | null;
  final_availability: string | null;
  final_source: string | null;
  prepared_response_text: string | null;
  human_required: boolean;
  sla_deadline_at: string | null;
  next_eligible_check_at: string | null;
  created_at: string;
}

export async function getStockInquiry(id: string): Promise<StockInquiryRow | null> {
  const db = database('stock_inquiries');
  const params = new URLSearchParams({ id: `eq.${id}`, select: '*' });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to fetch stock inquiry (${response.status}).`);
  const rows = await response.json() as StockInquiryRow[];
  return rows[0] ?? null;
}

/** The most recent open (NEEDS_QUANTITY) inquiry for this conversation — brief section 9's conversational follow-up. */
export async function findOpenNeedsQuantityInquiry(conversationId: string): Promise<StockInquiryRow | null> {
  const db = database('stock_inquiries');
  const params = new URLSearchParams({
    conversation_id: `eq.${conversationId}`,
    status: 'eq.NEEDS_QUANTITY',
    select: '*',
    order: 'created_at.desc',
    limit: '1',
  });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to look up pending quantity inquiry (${response.status}).`);
  const rows = await response.json() as StockInquiryRow[];
  return rows[0] ?? null;
}

export async function updateStockInquiry(id: string, updates: Record<string, unknown>): Promise<void> {
  const db = database('stock_inquiries');
  const response = await fetch(`${db.url}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...db.headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Unable to update stock inquiry (${response.status}).`);
}

export interface StockCheckRequestRow {
  id: string;
  item_id: string;
  item_code: string | null;
  source: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  response_at: string | null;
  next_action_at: string | null;
  response_raw: string | null;
  parsed_availability: string | null;
  parsed_quantity_internal: number | null;
  recorded_by: string | null;
}

/** Finds an existing open check request for the same item+source — brief section 25 dedup. */
export async function findOpenStockCheckRequest(itemId: string, source: string): Promise<StockCheckRequestRow | null> {
  const db = database('stock_check_requests');
  const params = new URLSearchParams({
    item_id: `eq.${itemId}`,
    source: `eq.${source}`,
    status: 'in.(PENDING,SENT,WAITING,VENDOR_CLOSED)',
    select: '*',
    order: 'created_at.desc',
    limit: '1',
  });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to look up open stock check request (${response.status}).`);
  const rows = await response.json() as StockCheckRequestRow[];
  return rows[0] ?? null;
}

export async function createStockCheckRequest(input: { itemId: string; itemCode: string | null; source: string; status: string }): Promise<StockCheckRequestRow> {
  const db = database('stock_check_requests');
  const response = await fetch(db.url, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'return=representation' },
    body: JSON.stringify({ item_id: input.itemId, item_code: input.itemCode, source: input.source, status: input.status }),
  });
  if (!response.ok) throw new Error(`Unable to create stock check request (${response.status}).`);
  const rows = await response.json() as StockCheckRequestRow[];
  return rows[0];
}

export async function updateStockCheckRequest(id: string, updates: Record<string, unknown>): Promise<void> {
  const db = database('stock_check_requests');
  const response = await fetch(`${db.url}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...db.headers, Prefer: 'return=minimal' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Unable to update stock check request (${response.status}).`);
}

export async function linkInquiryToCheckRequest(checkRequestId: string, inquiryId: string, requestedQuantity: number | null, requestedUnit: string | null): Promise<void> {
  const db = database('stock_check_request_inquiries');
  const response = await fetch(db.url, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify({ stock_check_request_id: checkRequestId, stock_inquiry_id: inquiryId, requested_quantity: requestedQuantity, requested_unit: requestedUnit }),
  });
  if (!response.ok) throw new Error(`Unable to link inquiry to stock check request (${response.status}).`);
}

export interface LinkedInquiry {
  stock_inquiry_id: string;
  requested_quantity: number | null;
  requested_unit: string | null;
}

export async function getLinkedInquiries(checkRequestId: string): Promise<LinkedInquiry[]> {
  const db = database('stock_check_request_inquiries');
  const params = new URLSearchParams({
    stock_check_request_id: `eq.${checkRequestId}`,
    select: 'stock_inquiry_id,requested_quantity,requested_unit',
  });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to fetch linked inquiries (${response.status}).`);
  return await response.json() as LinkedInquiry[];
}

/**
 * Finds VENDOR_CLOSED *inquiries* to reopen — used by the cron sweep. Closed
 * inquiries never created a stock_check_requests row (startVendorCheck checks
 * operating hours before creating one), so this queries stock_inquiries
 * directly rather than stock_check_requests.
 */
export async function findVendorClosedInquiries(): Promise<StockInquiryRow[]> {
  const db = database('stock_inquiries');
  const params = new URLSearchParams({ status: 'eq.VENDOR_CLOSED', select: '*' });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to fetch vendor-closed inquiries (${response.status}).`);
  return await response.json() as StockInquiryRow[];
}

export async function findOpenInquiriesForSla(): Promise<StockInquiryRow[]> {
  const db = database('stock_inquiries');
  const params = new URLSearchParams({
    status: 'in.(WAITING_FOR_VENDOR,NEEDS_HUMAN,CHECKING_VARINDO_STOCK)',
    select: '*',
  });
  const response = await fetch(`${db.url}?${params.toString()}`, { headers: db.headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to fetch open inquiries for SLA sweep (${response.status}).`);
  return await response.json() as StockInquiryRow[];
}
