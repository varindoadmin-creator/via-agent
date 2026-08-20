import type { Role } from '@/lib/auth';
import { claimPendingSalesOrder, finishPendingAction } from './store';
import { getCustomerItemPrice } from '@/lib/zoho/customerPricing';
import { createDraftSalesOrder } from '@/lib/zoho/salesOrders';

export async function approveAndCreateSalesOrder(input: {
  approvalId: string;
  conversationId: string;
  role: Role;
}) {
  const action = await claimPendingSalesOrder({ id: input.approvalId, conversationId: input.conversationId, role: input.role });
  if (!action) throw new Error('This approval is invalid, expired, already used, or belongs to another conversation.');
  try {
    for (const item of action.payload.items) {
      const current = await getCustomerItemPrice(action.payload.customer_id, item.item_id);
      if (!current || current.official_rate !== item.rate) {
        throw new Error('An official item price changed after the preview. Prepare a new Sales Order preview before approval.');
      }
    }
    const created = await createDraftSalesOrder({
      customer_id: action.payload.customer_id,
      date: new Date().toISOString().slice(0, 10),
      line_items: action.payload.items,
      notes: action.payload.notes,
    });
    await finishPendingAction(action.id, {
      status: 'completed',
      zoho_object_id: created.salesorder_id,
      zoho_object_number: created.salesorder_number,
    });
    return created;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Sales Order creation failed.';
    await finishPendingAction(action.id, { status: 'failed', error: message.slice(0, 1000) });
    throw cause;
  }
}
