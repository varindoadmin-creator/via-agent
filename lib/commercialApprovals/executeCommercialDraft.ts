// ─── Approval-controlled Zoho Quotation/Sales Order execution ───────────────
// Brief sections 45-48: claim -> revalidate everything (section 46) -> write
// via the trusted QuotationService/SalesOrderService -> finalize-or-reconcile.
// Same shape as executeCustomerCreation.ts and lib/jarvis/approvals/execute.ts.

import { claimApprovalForExecution, finishApproval, markExecutionUnknown } from './store.ts';
import { getCommercialDraft, getDraftLines, updateCommercialDraft } from '../integrations/wati/commercial/draft.ts';
import { isApprovalStillValid, computeDraftHash } from '../customerIdentity/approval.ts';
import { getCustomerById } from '../zoho/customers.ts';
import { getCustomerSafePrice } from '../integrations/wati/pricing/customerSafePrice.ts';
import { createDraftSalesOrder } from '../zoho/salesOrders.ts';
import { createDraftEstimate } from '../zoho/estimates.ts';
import type { CommercialDraft, CommercialDraftLine } from '../integrations/wati/commercial/draft.ts';
import { recordAnalyticsEvent } from '../analytics/events.ts';
import { isAnalyticsEventPipelineEnabled } from '../customerIdentity/featureFlags.ts';

export function commercialDraftMaterialFields(draft: CommercialDraft, lines: CommercialDraftLine[]): Record<string, unknown> {
  return {
    type: draft.type,
    customer_id: draft.customer_id,
    delivery_address_id: draft.delivery_address_id,
    proposed_delivery_address: draft.proposed_delivery_address,
    lines: lines.map(l => ({ product_id: l.product_id, quantity: l.quantity, approved_unit_price: l.approved_unit_price })),
  };
}

export async function approveAndCreateCommercialDraft(approvalId: string): Promise<{ objectId: string; objectNumber: string; type: 'ESTIMATE' | 'SALES_ORDER' }> {
  const action = await claimApprovalForExecution(approvalId);
  if (!action || action.draft_type !== 'COMMERCIAL') {
    throw new Error('This approval is invalid, already used, or not a commercial-draft approval.');
  }

  const draft = await getCommercialDraft(action.draft_id);
  if (!draft) {
    await finishApproval(action.id, { status: 'FAILED', error: 'Commercial draft no longer exists.' });
    throw new Error('Commercial draft no longer exists.');
  }
  const lines = await getDraftLines(draft.id);

  // Section 46: revalidate everything immediately before the write.
  if (!isApprovalStillValid({ approvedVersion: action.draft_version, approvedHash: action.draft_hash, currentVersion: draft.version, currentMaterialFields: commercialDraftMaterialFields(draft, lines) })) {
    await finishApproval(action.id, { status: 'FAILED', error: 'Draft changed after approval; prepare a new approval before executing.' });
    throw new Error('Draft changed after approval; prepare a new approval before executing.');
  }

  if (!draft.customer_id || lines.length === 0) {
    await finishApproval(action.id, { status: 'FAILED', error: 'Draft is missing a customer or product lines.' });
    throw new Error('Draft is missing a customer or product lines.');
  }

  const customer = await getCustomerById(draft.customer_id);
  if (!customer || customer.status !== 'active') {
    await finishApproval(action.id, { status: 'FAILED', error: 'Customer is no longer active/valid.' });
    throw new Error('Customer is no longer active/valid.');
  }

  // Revalidate every line's price is still current (brief section 46) — never trust the price captured when the draft was prepared.
  for (const line of lines) {
    const currentPrice = await getCustomerSafePrice(line.product_id, draft.customer_id);
    if (currentPrice.sourceStatus !== 'VERIFIED' || currentPrice.amount !== line.approved_unit_price) {
      await finishApproval(action.id, { status: 'FAILED', error: 'An official item price changed after this draft was prepared. Prepare a new draft before approval.' });
      throw new Error('An official item price changed after this draft was prepared. Prepare a new draft before approval.');
    }
  }

  const lineItems = lines.map(l => ({ item_id: l.product_id, quantity: l.quantity, rate: l.approved_unit_price ?? 0, unit: l.unit ?? undefined, description: l.product_name }));
  const shippingAddress = draft.proposed_delivery_address
    ? { address: draft.proposed_delivery_address.address, city: draft.proposed_delivery_address.city || '', state: draft.proposed_delivery_address.state || '', zip: draft.proposed_delivery_address.zip || '', country: draft.proposed_delivery_address.country || 'Indonesia' }
    : undefined;

  let createdId: string | null = null;
  try {
    if (draft.type === 'QUOTATION') {
      const estimate = await createDraftEstimate({ customer_id: draft.customer_id, date: new Date().toISOString().slice(0, 10), line_items: lineItems, shipping_address: shippingAddress });
      createdId = estimate.estimate_id;
      await updateCommercialDraft(draft.id, draft.version, { status: 'COMPLETED', zoho_object_type: 'ESTIMATE', zoho_object_id: estimate.estimate_id, zoho_object_number: estimate.estimate_number });
      await finishApproval(action.id, { status: 'COMPLETED', zohoObjectId: estimate.estimate_id, zohoObjectNumber: estimate.estimate_number });
      if (isAnalyticsEventPipelineEnabled()) {
        void recordAnalyticsEvent({ eventType: 'quotation.created', sourceId: draft.id, conversationId: draft.conversation_id, customerId: draft.customer_id, draftId: draft.id, orderId: estimate.estimate_id, source: draft.source });
      }
      return { objectId: estimate.estimate_id, objectNumber: estimate.estimate_number, type: 'ESTIMATE' };
    }
    const salesOrder = await createDraftSalesOrder({ customer_id: draft.customer_id, date: new Date().toISOString().slice(0, 10), line_items: lineItems, shipping_address: shippingAddress });
    createdId = salesOrder.salesorder_id;
    await updateCommercialDraft(draft.id, draft.version, { status: 'COMPLETED', zoho_object_type: 'SALES_ORDER', zoho_object_id: salesOrder.salesorder_id, zoho_object_number: salesOrder.salesorder_number });
    await finishApproval(action.id, { status: 'COMPLETED', zohoObjectId: salesOrder.salesorder_id, zohoObjectNumber: salesOrder.salesorder_number });
    if (isAnalyticsEventPipelineEnabled()) {
      void recordAnalyticsEvent({ eventType: 'order.created', sourceId: draft.id, conversationId: draft.conversation_id, customerId: draft.customer_id, draftId: draft.id, orderId: salesOrder.salesorder_id, source: draft.source, properties: { total: draft.total ?? 0 } });
    }
    return { objectId: salesOrder.salesorder_id, objectNumber: salesOrder.salesorder_number, type: 'SALES_ORDER' };
  } catch (cause) {
    if (createdId) {
      await markExecutionUnknown(action.id);
      throw new Error(`Zoho created ${createdId}, but VIA could not finish recording it. Do not retry; reconcile this approval manually.`);
    }
    const message = cause instanceof Error ? cause.message : 'Commercial draft execution failed.';
    await finishApproval(action.id, { status: 'FAILED', error: message }).catch(() => undefined);
    throw cause;
  }
}

export { computeDraftHash };
