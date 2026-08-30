// ─── CommercialDraft store ────────────────────────────────────────────────────
// Brief sections 31-32, 40: the order/quotation draft and its lines. Purely a
// Supabase-backed state container — workflow.ts drives the actual resolution
// logic (customer/address/product/price/stock), and
// lib/commercialApprovals/executeCommercialDraft.ts performs the eventual
// Zoho write, only after WAITING_FOR_APPROVAL -> an internal approval.

import { supabaseSelect, supabaseInsert, supabasePatch } from '../../../supabase/rest.ts';

const DRAFT_TABLE = 'commercial_drafts';
const LINE_TABLE = 'commercial_draft_lines';

export type CommercialDraftType = 'QUOTATION' | 'SALES_ORDER';
export type CommercialDraftStatus =
  | 'DRAFT' | 'NEEDS_CUSTOMER' | 'CUSTOMER_ONBOARDING' | 'NEEDS_PRODUCT' | 'NEEDS_QUANTITY'
  | 'NEEDS_PRICE' | 'WAITING_STOCK' | 'NEEDS_DELIVERY_INFO' | 'READY_FOR_REVIEW'
  | 'WAITING_FOR_APPROVAL' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'STALE' | 'CANCELLED';

export interface ProposedAddress {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface CommercialDraft {
  id: string;
  organization_id: string;
  type: CommercialDraftType;
  source: 'WATI' | 'VIA';
  conversation_id: string | null;
  customer_id: string | null;
  customer_draft_id: string | null;
  delivery_address_id: string | null;
  proposed_delivery_address: ProposedAddress | null;
  pending_product_id: string | null;
  pending_item_code: string | null;
  pending_product_name: string | null;
  pending_quantity: number | null;
  pending_unit: string | null;
  pending_brand: string | null;
  pending_source_message_id: string | null;
  status: CommercialDraftStatus;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  salesperson_id: string | null;
  payment_terms_id: string | null;
  source_message_ids: string[];
  zoho_object_type: 'ESTIMATE' | 'SALES_ORDER' | null;
  zoho_object_id: string | null;
  zoho_object_number: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type StockStatus = 'PENDING' | 'SUFFICIENT' | 'INSUFFICIENT' | 'OUT_OF_STOCK' | 'UNKNOWN';

export interface CommercialDraftLine {
  id: string;
  commercial_draft_id: string;
  product_id: string;
  item_code: string | null;
  product_name: string;
  quantity: number;
  unit: string | null;
  approved_unit_price: number | null;
  tax_treatment: string | null;
  stock_status: StockStatus;
  stock_inquiry_id: string | null;
  source_message_id: string | null;
  line_order: number;
}

/** Derives a line's customer-safe stock status from the linked Phase 3 stock_inquiries row (never a raw quantity). */
export function deriveStockStatusFromInquiry(finalAvailability: string | null): StockStatus {
  switch (finalAvailability) {
    case 'AVAILABLE':
    case 'SUFFICIENT': return 'SUFFICIENT';
    case 'INSUFFICIENT': return 'INSUFFICIENT';
    case 'OUT_OF_STOCK': return 'OUT_OF_STOCK';
    case 'UNKNOWN': return 'UNKNOWN';
    default: return 'PENDING';
  }
}

export async function createCommercialDraft(input: { type: CommercialDraftType; conversationId: string; sourceMessageId: string }): Promise<CommercialDraft> {
  const row = await supabaseInsert<CommercialDraft>(DRAFT_TABLE, {
    type: input.type,
    source: 'WATI',
    conversation_id: input.conversationId,
    status: 'NEEDS_CUSTOMER',
    source_message_ids: [input.sourceMessageId],
  });
  if (!row) throw new Error('Commercial draft was not created.');
  return row;
}

/** Only one active (non-terminal) draft per conversation — brief section 22: never re-ask identity/address within one active draft. */
export async function findActiveDraftForConversation(conversationId: string): Promise<CommercialDraft | null> {
  const rows = await supabaseSelect<CommercialDraft>(
    DRAFT_TABLE,
    `conversation_id=eq.${encodeURIComponent(conversationId)}&status=not.in.(COMPLETED,FAILED,CANCELLED,STALE)&select=*&order=created_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

export async function getCommercialDraft(id: string): Promise<CommercialDraft | null> {
  const rows = await supabaseSelect<CommercialDraft>(DRAFT_TABLE, `id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ?? null;
}

export async function updateCommercialDraft(id: string, currentVersion: number, patch: Partial<Omit<CommercialDraft, 'id' | 'version'>>): Promise<CommercialDraft> {
  const rows = await supabasePatch<CommercialDraft>(DRAFT_TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${currentVersion}`, {
    ...patch,
    version: currentVersion + 1,
    updated_at: new Date().toISOString(),
  });
  if (!rows[0]) throw new Error('Commercial draft was modified concurrently; reload before retrying.');
  return rows[0];
}

export async function getDraftLines(draftId: string): Promise<CommercialDraftLine[]> {
  return supabaseSelect<CommercialDraftLine>(LINE_TABLE, `commercial_draft_id=eq.${encodeURIComponent(draftId)}&select=*&order=line_order.asc`);
}

export async function updateDraftLineStockStatus(lineId: string, status: StockStatus): Promise<void> {
  await supabasePatch(LINE_TABLE, `id=eq.${encodeURIComponent(lineId)}`, { stock_status: status });
}

export async function upsertDraftLine(input: {
  draftId: string; lineOrder: number; productId: string; itemCode: string | null; productName: string;
  quantity: number; unit: string | null; approvedUnitPrice: number | null; stockStatus: StockStatus;
  stockInquiryId: string | null; sourceMessageId: string | null;
}): Promise<CommercialDraftLine> {
  const row = await supabaseInsert<CommercialDraftLine>(LINE_TABLE, {
    commercial_draft_id: input.draftId,
    line_order: input.lineOrder,
    product_id: input.productId,
    item_code: input.itemCode,
    product_name: input.productName,
    quantity: input.quantity,
    unit: input.unit,
    approved_unit_price: input.approvedUnitPrice,
    stock_status: input.stockStatus,
    stock_inquiry_id: input.stockInquiryId,
    source_message_id: input.sourceMessageId,
  });
  if (!row) throw new Error('Commercial draft line was not created.');
  return row;
}

export async function listCommercialDraftsByStatus(statuses: CommercialDraftStatus[]): Promise<CommercialDraft[]> {
  return supabaseSelect<CommercialDraft>(DRAFT_TABLE, `status=in.(${statuses.join(',')})&select=*&order=updated_at.desc&limit=200`);
}

/** Wakes up any commercial draft that was waiting on this customer's onboarding to finish (brief section 6's flow continuing straight into product/price/stock resolution once the Zoho customer exists). */
export async function attachCustomerToOnboardingDrafts(customerDraftId: string, customerId: string): Promise<void> {
  await supabasePatch(DRAFT_TABLE, `customer_draft_id=eq.${encodeURIComponent(customerDraftId)}&status=eq.CUSTOMER_ONBOARDING`, {
    customer_id: customerId, status: 'NEEDS_PRODUCT', updated_at: new Date().toISOString(),
  });
}
