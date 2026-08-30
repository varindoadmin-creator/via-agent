// ─── Pending stock inquiry creation ─────────────────────────────────────────────
// Phase 2 created a RECEIVED-only row here. Phase 3 (lib/integrations/wati/
// stock/*) now drives it through the full workflow — this function still only
// creates the initial row; everything after that lives in stock/service.ts.

const TABLE = 'stock_inquiries';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error('Stock inquiry storage is not configured.');
  return { url: `${base}/rest/v1/${TABLE}`, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export interface CreateStockInquiryInput {
  customerId: string | null;
  conversationId: string;
  /** The actual WhatsApp number — conversationId is often the normalized phone key, not a valid send target. */
  customerPhoneRaw: string | null;
  inboundMessageId: string;
  itemId: string | null;
  itemCode: string | null;
  brand: string | null;
  requestedQuantity: number | null;
  requestedUnit: string | null;
  /** Type A/B (existence/quantity-specific) start at RECEIVED; Type C (count inquiry) starts at NEEDS_QUANTITY. */
  status?: string;
  stockInquiryType?: 'EXISTENCE' | 'QUANTITY_SPECIFIC' | 'COUNT_INQUIRY';
}

export async function createStockInquiry(input: CreateStockInquiryInput): Promise<{ id: string; status: string }> {
  const db = database();
  const response = await fetch(db.url, {
    method: 'POST',
    headers: { ...db.headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      customer_id: input.customerId,
      conversation_id: input.conversationId,
      customer_phone_raw: input.customerPhoneRaw,
      inbound_message_id: input.inboundMessageId,
      item_id: input.itemId,
      item_code: input.itemCode,
      brand: input.brand,
      requested_quantity: input.requestedQuantity,
      requested_unit: input.requestedUnit,
      status: input.status || 'RECEIVED',
      stock_inquiry_type: input.stockInquiryType ?? null,
    }),
  });
  if (!response.ok) throw new Error(`Unable to create stock inquiry (${response.status}).`);
  const rows = await response.json() as Array<{ id: string; status: string }>;
  return rows[0];
}
