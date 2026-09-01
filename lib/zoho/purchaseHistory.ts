// ─── Customer + item purchase history ─────────────────────────────────────────
// VIA Customer Operations Phase 11: no existing module computes a customer's
// historical purchase cadence for one item (confirmed by the Phase 11 audit —
// searchSalesOrders/searchCustomerInvoices are not line-item/cadence aware).
// Zoho's Sales Order list endpoint does not return line items, so this reads
// each candidate order's detail individually — expensive per call, which is
// why callers must keep both the order count and customer count small (see
// lib/proactiveActions/detectors/reorderOpportunity.ts).

import { searchSalesOrders, getSalesOrderById } from './salesOrders.ts';

export interface ItemPurchaseCadence {
  itemId: string;
  itemName: string;
  orderCount: number;
  lastPurchaseDate: string;
  averageGapDays: number;
  daysSinceLastPurchase: number;
}

/**
 * Reads up to `maxOrders` most-recent Sales Orders for a customer and
 * aggregates per-item purchase cadence. Only items purchased at least
 * `minOrderCount` times are returned — a single historical purchase is not
 * evidence of a reorder cycle.
 */
export async function getCustomerItemPurchaseCadence(customerId: string, maxOrders = 8, minOrderCount = 3): Promise<ItemPurchaseCadence[]> {
  const summaries = await searchSalesOrders(undefined, customerId, undefined, maxOrders);
  const orders = (await Promise.all(summaries.map(s => getSalesOrderById(s.salesorder_id)))).filter((o): o is NonNullable<typeof o> => Boolean(o));

  const byItem = new Map<string, { itemName: string; dates: string[] }>();
  for (const order of orders) {
    for (const line of order.line_items) {
      const entry = byItem.get(line.item_id) ?? { itemName: line.name, dates: [] };
      entry.dates.push(order.date);
      byItem.set(line.item_id, entry);
    }
  }

  const now = Date.now();
  const cadences: ItemPurchaseCadence[] = [];
  for (const [itemId, entry] of byItem) {
    if (entry.dates.length < minOrderCount) continue;
    const sortedDates = entry.dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) gaps.push((sortedDates[i] - sortedDates[i - 1]) / 86_400_000);
    const averageGapDays = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    const lastPurchaseMs = sortedDates[sortedDates.length - 1];
    cadences.push({
      itemId, itemName: entry.itemName, orderCount: entry.dates.length,
      lastPurchaseDate: new Date(lastPurchaseMs).toISOString(),
      averageGapDays, daysSinceLastPurchase: (now - lastPurchaseMs) / 86_400_000,
    });
  }
  return cadences;
}
