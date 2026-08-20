export interface SalesOrderLine {
  item_id?: unknown;
  name?: unknown;
  sku?: unknown;
  quantity?: unknown;
  quantity_invoiced?: unknown;
  quantity_shipped?: unknown;
  location_id?: unknown;
  location_name?: unknown;
}

export interface SalesOrderDetail {
  location_id?: unknown;
  location_name?: unknown;
  line_items?: SalesOrderLine[];
}

export interface StockLocation {
  location_id: string;
  location_name?: string;
  stock_on_hand: number;
}

export interface StockSummary {
  by_location: StockLocation[];
}

export interface UncoveredStockLine {
  item_id: string;
  item_name: string;
  sku: string;
  required_quantity: number;
  stock_on_hand: number;
  location_id: string;
  location_name: string;
}

export interface SalesOrderStockCoverage {
  covered: boolean;
  locations: string[];
  uncovered_items: UncoveredStockLine[];
}

/**
 * Zoho can leave a received-and-billed PO's Sales Order at "Not Yet Ordered".
 * In that state, warehouse stock is the reliable evidence: every outstanding
 * inventory line must be covered at the SO's assigned location.
 */
export function getSalesOrderStockCoverage(
  salesOrder: SalesOrderDetail,
  stockByItem: Map<string, StockSummary>,
): SalesOrderStockCoverage {
  const lines = Array.isArray(salesOrder.line_items) ? salesOrder.line_items : [];
  const demandByItemLocation = new Map<string, { itemId: string; itemName: string; sku: string; locationId: string; locationName: string; quantity: number }>();

  for (const line of lines) {
    const itemId = String(line.item_id || '');
    const locationId = String(line.location_id || salesOrder.location_id || '');
    const outstanding = Math.max(0, (Number(line.quantity) || 0) - (Number(line.quantity_shipped ?? line.quantity_invoiced) || 0));
    if (!itemId || !locationId || outstanding <= 0) continue;
    const key = `${itemId}::${locationId}`;
    const existing = demandByItemLocation.get(key);
    demandByItemLocation.set(key, {
      itemId,
      itemName: String(line.name || existing?.itemName || itemId),
      sku: String(line.sku || existing?.sku || ''),
      locationId,
      locationName: String(line.location_name || salesOrder.location_name || existing?.locationName || locationId),
      quantity: (existing?.quantity || 0) + outstanding,
    });
  }

  if (demandByItemLocation.size === 0) return { covered: false, locations: [], uncovered_items: [] };
  const locations = new Set<string>();
  const uncoveredItems: UncoveredStockLine[] = [];
  for (const demand of demandByItemLocation.values()) {
    const location = stockByItem.get(demand.itemId)?.by_location.find(row => row.location_id === demand.locationId);
    const locationName = location?.location_name || demand.locationName;
    locations.add(locationName);
    const onHand = location?.stock_on_hand || 0;
    if (onHand < demand.quantity) {
      uncoveredItems.push({
        item_id: demand.itemId,
        item_name: demand.itemName,
        sku: demand.sku,
        required_quantity: demand.quantity,
        stock_on_hand: onHand,
        location_id: demand.locationId,
        location_name: locationName,
      });
    }
  }
  return { covered: uncoveredItems.length === 0, locations: Array.from(locations), uncovered_items: uncoveredItems };
}

export function isSalesOrderCoveredByStock(
  salesOrder: SalesOrderDetail,
  stockByItem: Map<string, StockSummary>,
): boolean {
  return getSalesOrderStockCoverage(salesOrder, stockByItem).covered;
}
