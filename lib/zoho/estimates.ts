// ─── Zoho Books Estimates (Quotations) ────────────────────────────────────────
// VIA Customer Operations Phase 6, brief section 45 (QuotationService). Mirrors
// lib/zoho/salesOrders.ts's create/get shape exactly: draft-status-first,
// retries: 0 (a timed-out create has an unknown outcome — the approval
// workflow reconciles manually rather than risking a duplicate POST).

import type {
  ZohoEstimate,
  ZohoEstimateResponse,
  ZohoCreateEstimatePayload,
} from '../../types/zoho.ts';
import { zohoRequest, isMockMode } from './client.ts';

let mockEstimateCounter = 1;
const MOCK_ESTIMATES: ZohoEstimate[] = [];

export async function getEstimateById(estimateId: string): Promise<ZohoEstimate | null> {
  if (isMockMode()) {
    return MOCK_ESTIMATES.find((e) => e.estimate_id === estimateId) || null;
  }
  try {
    const response = await zohoRequest<ZohoEstimateResponse>(`/estimates/${estimateId}`);
    return response.estimate || null;
  } catch {
    return null;
  }
}

/**
 * Create a draft Estimate (Quotation) in Zoho Books.
 * ONLY called after internal approval of a CommercialDraft(type=QUOTATION).
 */
export async function createDraftEstimate(payload: ZohoCreateEstimatePayload): Promise<ZohoEstimate> {
  if (isMockMode()) {
    return mockCreateEstimate(payload);
  }

  const response = await zohoRequest<ZohoEstimateResponse>('/estimates', {
    method: 'POST',
    retries: 0,
    body: { ...payload, status: 'draft' } as Record<string, unknown>,
  });

  if (!response.estimate) throw new Error('Zoho did not return an estimate after creation.');
  return response.estimate;
}

function mockCreateEstimate(payload: ZohoCreateEstimatePayload): ZohoEstimate {
  const subTotal = payload.line_items.reduce((sum, item) => sum + item.rate * item.quantity, 0);
  const estimate: ZohoEstimate = {
    estimate_id: `EST-MOCK-${mockEstimateCounter}`,
    estimate_number: `EST-${String(mockEstimateCounter).padStart(5, '0')}`,
    date: payload.date,
    status: 'draft',
    customer_id: payload.customer_id,
    customer_name: '',
    currency_code: 'IDR',
    line_items: payload.line_items.map((item, i) => ({
      line_item_id: `MOCK-LI-${i}`,
      item_id: item.item_id,
      name: item.description || item.item_id,
      quantity: item.quantity,
      unit: item.unit,
      rate: item.rate,
      amount: item.rate * item.quantity,
    })),
    sub_total: subTotal,
    total: subTotal,
    notes: payload.notes,
    created_time: new Date().toISOString(),
  };
  mockEstimateCounter++;
  MOCK_ESTIMATES.push(estimate);
  return estimate;
}
