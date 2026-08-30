// ─── Stock workflow orchestration ───────────────────────────────────────────────
// The functions the pipeline (inquiry creation) and the admin dashboard API
// routes (vendor response recording, sending) both call. This is where the
// deterministic business rules from the brief actually get enforced together —
// vendor-first, OOS-only fallback, and confidentiality — never in the pipeline
// or the routes directly.

import type { ZohoItem } from '../../../../types/zoho.ts';
import { assertTransition, type StockInquiryState } from './workflow.ts';
import { resolveStockSource } from './sourceResolver.ts';
import { isSourceOpen, nextOpeningTime } from './operatingCalendar.ts';
import { slaBreachMinutes } from './sla.ts';
import { parseVendorResponse, type ParsedVendorAvailability } from './vendorResponse.ts';
import { toCustomerStockResult } from './disclosurePolicy.ts';
import { checkVarindoAvailability } from './varindoFallback.ts';
import * as responses from './responses.ts';
import {
  createStockCheckRequest, findOpenStockCheckRequest, linkInquiryToCheckRequest,
  getLinkedInquiries, updateStockCheckRequest, updateStockInquiry, getStockInquiry,
  type StockCheckRequestRow, type StockInquiryRow,
} from './store.ts';
import { sendWatiText } from '../client.ts';
import { getConversationState } from '../conversationState.ts';
import { stockAck } from '../responseDecision.ts';

async function moveInquiry(inquiry: Pick<StockInquiryRow, 'id' | 'status'>, to: StockInquiryState, extra: Record<string, unknown> = {}): Promise<void> {
  assertTransition(inquiry.status as StockInquiryState, to);
  await updateStockInquiry(inquiry.id, { status: to, ...extra });
}

export interface StartWorkflowResult {
  responseText: string | null;
  state: StockInquiryState;
}

/**
 * Entry point for a fresh (Type A/B, already-have-a-product) stock inquiry —
 * resolves the vendor, checks their hours, and either starts the vendor check
 * or defers to their next opening. Never touches Varindo's own stock here
 * (Rule 1) — that only happens in recordVendorResponse, after a definitive
 * vendor OUT_OF_STOCK.
 */
export async function startVendorCheck(
  inquiry: Pick<StockInquiryRow, 'id' | 'status'>,
  product: ZohoItem,
  knownBrand: string | null,
  requestedQuantity: number | null,
  requestedUnit: string | null,
  now: Date = new Date(),
): Promise<StartWorkflowResult> {
  const source = resolveStockSource(product, knownBrand);
  const slaDeadline = new Date(now.getTime() + slaBreachMinutes() * 60_000).toISOString();

  // Both entry states (RECEIVED and NEEDS_QUANTITY, from a quantity follow-up)
  // already allow -> READY_FOR_VENDOR_CHECK, so that's always the first move —
  // NEEDS_HUMAN is only reachable from there, not directly from either entry
  // state, keeping the state table's own invariants intact.
  await moveInquiry(inquiry, 'READY_FOR_VENDOR_CHECK', { primary_source: source.sourceId, sla_deadline_at: slaDeadline });

  if (source.confidence === 'UNRESOLVED') {
    await moveInquiry({ id: inquiry.id, status: 'READY_FOR_VENDOR_CHECK' }, 'NEEDS_HUMAN', { human_required: true });
    return { responseText: null, state: 'NEEDS_HUMAN' };
  }

  if (!isSourceOpen(source.sourceId!, now)) {
    const nextOpen = nextOpeningTime(source.sourceId!, now);
    await moveInquiry({ id: inquiry.id, status: 'READY_FOR_VENDOR_CHECK' }, 'VENDOR_CLOSED', { next_eligible_check_at: nextOpen.toISOString() });
    return { responseText: responses.vendorClosedAck(), state: 'VENDOR_CLOSED' };
  }

  await attachToVendorCheck({ id: inquiry.id, status: 'READY_FOR_VENDOR_CHECK' }, product.item_id, product.sku ?? null, source.sourceId!, requestedQuantity, requestedUnit);
  return { responseText: stockAck(product), state: 'WAITING_FOR_VENDOR' };
}

async function getOrCreateCheckRequest(itemId: string, itemCode: string | null, source: string): Promise<StockCheckRequestRow> {
  const existing = await findOpenStockCheckRequest(itemId, source);
  if (existing) return existing;
  return createStockCheckRequest({ itemId, itemCode, source, status: 'WAITING' });
}

/** Shared by startVendorCheck's "vendor open" path and the cron sweep's reopen path. */
async function attachToVendorCheck(
  inquiry: Pick<StockInquiryRow, 'id' | 'status'>,
  itemId: string,
  itemCode: string | null,
  source: string,
  requestedQuantity: number | null,
  requestedUnit: string | null,
): Promise<void> {
  const checkRequest = await getOrCreateCheckRequest(itemId, itemCode, source);
  await linkInquiryToCheckRequest(checkRequest.id, inquiry.id, requestedQuantity, requestedUnit);
  await moveInquiry(inquiry, 'WAITING_FOR_VENDOR', { active_stock_check_request_id: checkRequest.id, next_eligible_check_at: null });
}

/**
 * Reopens a VENDOR_CLOSED *inquiry* once its vendor's hours resume — called by
 * the cron sweep, never depends on admin memory (brief section 22). Vendor
 * hours are checked (not stock_check_requests) because closed inquiries never
 * created a check request in the first place — see docs/customer-operations-
 * stock.md's note on this.
 */
export async function reopenIfNowOpen(inquiry: StockInquiryRow, now: Date = new Date()): Promise<boolean> {
  if (!inquiry.primary_source || !isSourceOpen(inquiry.primary_source, now) || !inquiry.item_id) return false;
  await attachToVendorCheck({ id: inquiry.id, status: 'VENDOR_CLOSED' }, inquiry.item_id, inquiry.item_code, inquiry.primary_source, inquiry.requested_quantity, inquiry.requested_unit);
  return true;
}

export interface RecordVendorResponseInput {
  checkRequestId: string;
  recordedBy: string;
  /** Either a raw admin-typed response (parsed deterministically), or a direct button action. */
  rawText?: string;
  directAvailability?: 'AVAILABLE' | 'OUT_OF_STOCK';
}

/** brief section 15/16: normalizes the vendor response, then fans it out to every linked inquiry, quantity-safely (section 25). */
export async function recordVendorResponse(input: RecordVendorResponseInput): Promise<void> {
  const parsed = input.directAvailability
    ? { availability: input.directAvailability as ParsedVendorAvailability, quantity: null }
    : parseVendorResponse(input.rawText ?? '');

  await updateStockCheckRequest(input.checkRequestId, {
    status: parsed.availability === 'AMBIGUOUS' || parsed.availability === 'UNKNOWN' ? 'WAITING' : 'RESPONSE_RECEIVED',
    response_at: new Date().toISOString(),
    response_raw: input.rawText ?? null,
    parsed_availability: parsed.availability,
    parsed_quantity_internal: parsed.quantity,
    recorded_by: input.recordedBy,
  });

  const linked = await getLinkedInquiries(input.checkRequestId);
  await Promise.all(linked.map(link => applyVendorResultToInquiry(link.stock_inquiry_id, parsed.availability, parsed.quantity)));
}

async function applyVendorResultToInquiry(inquiryId: string, availability: ParsedVendorAvailability, vendorQuantity: number | null): Promise<void> {
  const inquiry = await getStockInquiry(inquiryId);
  if (!inquiry) return;

  if (availability === 'AMBIGUOUS' || availability === 'FUTURE_AVAILABILITY' || availability === 'UNKNOWN') {
    await moveInquiry(inquiry, 'NEEDS_HUMAN', { human_required: true });
    return;
  }

  if (availability === 'OUT_OF_STOCK') {
    await moveInquiry(inquiry, 'VENDOR_OUT_OF_STOCK');
    await runVarindoFallback(await getStockInquiry(inquiryId) as StockInquiryRow);
    return;
  }

  // AVAILABLE
  await moveInquiry(inquiry, 'VENDOR_AVAILABLE');
  const result = toCustomerStockResult({
    requestedQuantity: inquiry.requested_quantity,
    availableQuantity: vendorQuantity,
    availability: 'AVAILABLE',
  });
  await finalizeInquiryResult(await getStockInquiry(inquiryId) as StockInquiryRow, result, 'VENDOR', false);
}

/** Rule 5: only ever called after a definitive VENDOR_OUT_OF_STOCK transition — never on VENDOR_CLOSED or no-response. */
async function runVarindoFallback(inquiry: StockInquiryRow): Promise<void> {
  await moveInquiry(inquiry, 'CHECKING_VARINDO_STOCK');
  if (!inquiry.item_id) {
    await moveInquiry({ id: inquiry.id, status: 'CHECKING_VARINDO_STOCK' }, 'NEEDS_HUMAN', { human_required: true });
    return;
  }
  const fallback = await checkVarindoAvailability(inquiry.item_id);
  const result = toCustomerStockResult({
    requestedQuantity: inquiry.requested_quantity,
    availableQuantity: fallback.availableQuantityConfidential,
    availability: fallback.availability,
  });
  const nextState: StockInquiryState = fallback.availability === 'AVAILABLE' ? 'VARINDO_AVAILABLE' : 'VARINDO_OUT_OF_STOCK';
  await moveInquiry({ id: inquiry.id, status: 'CHECKING_VARINDO_STOCK' }, nextState);
  await finalizeInquiryResult({ ...inquiry, status: nextState }, result, 'VARINDO_INTERNAL', true);
}

async function finalizeInquiryResult(
  inquiry: StockInquiryRow,
  result: 'AVAILABLE' | 'SUFFICIENT' | 'INSUFFICIENT' | 'OUT_OF_STOCK' | 'UNKNOWN',
  finalSource: 'VENDOR' | 'VARINDO_INTERNAL',
  fulfilledByFallback: boolean,
): Promise<void> {
  if (result === 'UNKNOWN') {
    await moveInquiry(inquiry, 'NEEDS_HUMAN', { human_required: true });
    return;
  }
  const text = responses.renderStockResult(result, {
    requestedQuantity: inquiry.requested_quantity,
    requestedUnit: inquiry.requested_unit,
    fulfilledByFallback,
  });
  await moveInquiry(inquiry, 'RESPONSE_READY', { final_availability: result, final_source: finalSource, prepared_response_text: text });
}

function autoSendEnabled(): boolean {
  return process.env.AUTO_SEND_STOCK_RESPONSES === 'true';
}

/**
 * Auto-send is opt-in and conservative (brief section 28): only high-confidence
 * cases, only when explicitly enabled, and only once — CLOSED is terminal so a
 * re-run can never double-send (brief section 40, outbound-send idempotency).
 */
export async function maybeAutoSend(inquiryId: string): Promise<boolean> {
  if (!autoSendEnabled()) return false;
  const inquiry = await getStockInquiry(inquiryId);
  if (!inquiry || inquiry.status !== 'RESPONSE_READY' || !inquiry.prepared_response_text) return false;
  if (inquiry.human_required) return false;

  const conversationState = await getConversationState(inquiry.conversation_id).catch(() => 'AUTO' as const);
  if (conversationState === 'NEEDS_HUMAN' || conversationState === 'HUMAN_ACTIVE') return false;

  return sendPreparedResponse(inquiryId, 'system:auto-send');
}

/** The admin-review-send action (or auto-send, above). Idempotent: a second call on an already-CLOSED inquiry is rejected by the state machine. */
export async function sendPreparedResponse(inquiryId: string, sentBy: string): Promise<boolean> {
  const inquiry = await getStockInquiry(inquiryId);
  if (!inquiry || !inquiry.prepared_response_text) return false;
  assertTransition(inquiry.status as StockInquiryState, 'CLOSED');

  if (!inquiry.customer_phone_raw) {
    console.error('[wati.stock]', JSON.stringify({ event: 'stock.response.send_failed', inquiryId, reason: 'missing_customer_phone_raw' }));
    return false;
  }
  const result = await sendWatiText(inquiry.customer_phone_raw, inquiry.prepared_response_text);

  await updateStockInquiry(inquiry.id, {
    status: 'CLOSED',
    closed_at: new Date().toISOString(),
  });
  console.info('[wati.stock]', JSON.stringify({ event: 'stock.response.sent', inquiryId, sentBy, delivery: result }));
  return true;
}
