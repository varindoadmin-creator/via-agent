// ─── Customer-scoped delivery/shipment status ────────────────────────────────
// VIA Customer Operations Phase 7, brief sections 25-29: resolves the Sales
// Order first (ownership-checked exactly like orderStatus.ts), then queries
// its packages/shipment orders. Never invents driver/ETA/truck/tracking data
// (brief section 26) — only what deriveDeliveryStatus can prove from real
// records.

import { searchSalesOrders } from '../zoho/salesOrders.ts';
import { getPackagesForSalesOrder, getShipmentOrdersForSalesOrder } from '../zoho/shipments.ts';
import { deriveDeliveryStatus, type CustomerSafeDeliveryStatusValue } from './statusNormalization.ts';

export interface CustomerSafeDeliveryStatus {
  orderNumber: string;
  status: CustomerSafeDeliveryStatusValue;
}

export type DeliveryLookupOutcome =
  | { outcome: 'FOUND'; result: CustomerSafeDeliveryStatus }
  | { outcome: 'ORDER_NOT_FOUND' }
  | { outcome: 'NO_AUTHORITATIVE_DATA'; orderNumber: string };

export async function getCustomerOwnDeliveryStatus(activeCustomerId: string, soNumber: string): Promise<DeliveryLookupOutcome> {
  const matches = await searchSalesOrders(soNumber, activeCustomerId);
  const so = matches.find(m => m.salesorder_number.toUpperCase() === soNumber.toUpperCase());
  if (!so) return { outcome: 'ORDER_NOT_FOUND' };

  const [packages, shipmentOrders] = await Promise.all([
    getPackagesForSalesOrder(so.salesorder_id).catch(() => null),
    getShipmentOrdersForSalesOrder(so.salesorder_id).catch(() => null),
  ]);

  if (packages === null || shipmentOrders === null) {
    return { outcome: 'NO_AUTHORITATIVE_DATA', orderNumber: so.salesorder_number };
  }

  const status = deriveDeliveryStatus(packages, shipmentOrders);
  return { outcome: 'FOUND', result: { orderNumber: so.salesorder_number, status } };
}
