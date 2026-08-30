// ─── Customer-scoped order status/history ────────────────────────────────────
// VIA Customer Operations Phase 7, brief sections 7-11, 27-28, 34: every
// function takes activeCustomerId first and passes it straight into Zoho's
// own customer_id query filter (lib/zoho/salesOrders.ts's searchSalesOrders),
// so a Sales Order belonging to a different customer never even comes back —
// ownership is structural, not a post-hoc check.

import { searchSalesOrders } from '../zoho/salesOrders.ts';
import type { ZohoSalesOrder } from '../../types/zoho.ts';
import { normalizeOrderStatus, type CustomerSafeOrderStatusValue } from './statusNormalization.ts';

export interface CustomerSafeOrderLine {
  itemCode: string | null;
  productName: string;
  quantity: number;
  unit: string | null;
}

export interface CustomerSafeOrderStatus {
  orderNumber: string;
  orderDate: string;
  status: CustomerSafeOrderStatusValue;
  items: CustomerSafeOrderLine[];
}

function toSafeOrder(so: ZohoSalesOrder): CustomerSafeOrderStatus {
  return {
    orderNumber: so.salesorder_number,
    orderDate: so.date,
    status: normalizeOrderStatus(so.status),
    items: so.line_items.map(li => ({ itemCode: li.sku ?? null, productName: li.name, quantity: li.quantity, unit: li.unit ?? null })),
  };
}

/** Returns null (never a cross-customer record) when the SO doesn't belong to this exact customer — the Zoho query itself is filtered by customer_id, so a wrong-customer SO number never confirms existence (brief section 68). */
export async function getCustomerOwnOrderStatus(activeCustomerId: string, soNumber: string): Promise<CustomerSafeOrderStatus | null> {
  const matches = await searchSalesOrders(soNumber, activeCustomerId);
  const exact = matches.find(so => so.salesorder_number.toUpperCase() === soNumber.toUpperCase());
  return exact ? toSafeOrder(exact) : null;
}

/** Brief section 11: latest 3-5 records only, never an unbounded history dump. */
export async function getCustomerOwnOrderHistory(activeCustomerId: string, limit = 5): Promise<CustomerSafeOrderStatus[]> {
  const results = await searchSalesOrders(undefined, activeCustomerId, undefined, limit);
  return results.map(toSafeOrder);
}

export async function getCustomerOwnLastOrder(activeCustomerId: string): Promise<CustomerSafeOrderStatus | null> {
  const results = await searchSalesOrders(undefined, activeCustomerId, undefined, 1);
  return results[0] ? toSafeOrder(results[0]) : null;
}

/** Brief section 27: multiple open orders for this customer — used to decide whether a bare "sudah dikirim?" needs clarification. */
export async function getCustomerOpenOrders(activeCustomerId: string, limit = 10): Promise<ZohoSalesOrder[]> {
  return searchSalesOrders(undefined, activeCustomerId, undefined, limit);
}
