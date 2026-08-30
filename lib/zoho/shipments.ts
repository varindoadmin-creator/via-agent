// ─── Zoho packages / shipment orders — scoped to one Sales Order ────────────
// VIA Customer Operations Phase 7, brief sections 25-26: the real,
// authoritative delivery data this org has (proven by app/api/shipments/route.ts's
// existing `/packages` and `/shipmentorders` usage) — never invented ETA/
// driver/tracking data beyond what these return.

import type { ZohoPackage, ZohoPackageListResponse, ZohoShipmentOrder, ZohoShipmentOrderListResponse } from '../../types/zoho.ts';
import { zohoRequest, isMockMode } from './client.ts';

export async function getPackagesForSalesOrder(salesOrderId: string): Promise<ZohoPackage[]> {
  if (isMockMode()) return [];
  const response = await zohoRequest<ZohoPackageListResponse>('/packages', {
    queryParams: { salesorder_id: salesOrderId, per_page: 50 },
  });
  return response.packages || [];
}

export async function getShipmentOrdersForSalesOrder(salesOrderId: string): Promise<ZohoShipmentOrder[]> {
  if (isMockMode()) return [];
  const response = await zohoRequest<ZohoShipmentOrderListResponse>('/shipmentorders', {
    queryParams: { salesorder_id: salesOrderId, per_page: 50 },
  });
  return response.shipmentorders || [];
}
