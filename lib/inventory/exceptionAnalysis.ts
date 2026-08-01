export type ExceptionSeverity = 'critical' | 'warning' | 'info';
export type ExceptionType = 'negative_stock' | 'stockout_risk' | 'aging_stock' | 'slow_moving' | 'location_mismatch';

export interface InventoryLocationSnapshot {
  location_name: string;
  stock_on_hand: number;
  available_stock: number;
  committed_stock: number;
}

export interface InventoryExceptionInput {
  item_id: string;
  name: string;
  sku: string;
  unit: string;
  stock_on_hand: number;
  available_stock: number;
  committed_stock: number;
  reorder_level: number;
  sold_90_days: number;
  sold_365_days: number;
  locations?: InventoryLocationSnapshot[];
}

export interface InventoryException {
  id: string;
  type: ExceptionType;
  severity: ExceptionSeverity;
  item_id: string;
  item_name: string;
  sku: string;
  unit: string;
  stock_on_hand: number;
  available_stock: number;
  sold_90_days: number;
  days_of_stock: number | null;
  location?: string;
  message: string;
  recommendation: string;
  transfer?: { from: string; to: string; quantity: number };
}

const rounded = (value: number) => Math.round(value * 10) / 10;

export function analyzeInventoryItem(item: InventoryExceptionInput): InventoryException[] {
  const alerts: InventoryException[] = [];
  const dailyVelocity = Math.max(0, item.sold_90_days) / 90;
  const daysOfStock = dailyVelocity > 0 ? Math.max(0, item.available_stock) / dailyVelocity : null;
  const base = {
    item_id: item.item_id,
    item_name: item.name,
    sku: item.sku,
    unit: item.unit,
    stock_on_hand: item.stock_on_hand,
    available_stock: item.available_stock,
    sold_90_days: item.sold_90_days,
    days_of_stock: daysOfStock === null ? null : rounded(daysOfStock),
  };

  if (item.stock_on_hand < 0 || item.available_stock < 0) {
    alerts.push({
      ...base,
      id: `${item.item_id}:negative`, type: 'negative_stock', severity: 'critical',
      message: `Negative balance: ${item.stock_on_hand} on hand and ${item.available_stock} available.`,
      recommendation: 'Reconcile recent invoices, stock adjustments, and transfers in Zoho before fulfilling more orders.',
    });
  }

  if (dailyVelocity > 0 && (daysOfStock! <= 30 || item.available_stock <= item.reorder_level)) {
    const severity: ExceptionSeverity = daysOfStock! <= 14 || item.available_stock <= 0 ? 'critical' : 'warning';
    alerts.push({
      ...base,
      id: `${item.item_id}:stockout`, type: 'stockout_risk', severity,
      message: `Approximately ${rounded(daysOfStock!)} days of stock remain at the recent sales rate.`,
      recommendation: `Review open purchase orders and replenish at least ${Math.max(0, Math.ceil(dailyVelocity * 30 - item.available_stock))} ${item.unit || 'units'} for 30-day cover.`,
    });
  }

  if (item.stock_on_hand > 0 && item.sold_365_days <= 0) {
    alerts.push({
      ...base,
      id: `${item.item_id}:aging`, type: 'aging_stock', severity: 'warning',
      message: `${item.stock_on_hand} ${item.unit || 'units'} in stock with no recorded sales in the last 365 days.`,
      recommendation: 'Verify the item is still sellable, then consider promotion, return, bundle, or purchasing hold.',
    });
  } else if (item.stock_on_hand > 0 && item.sold_365_days > 0 && item.stock_on_hand / (item.sold_365_days / 365) > 180) {
    alerts.push({
      ...base,
      id: `${item.item_id}:slow`, type: 'slow_moving', severity: 'info',
      message: `Current stock represents about ${Math.round(item.stock_on_hand / (item.sold_365_days / 365))} days at the 12-month sales rate.`,
      recommendation: 'Review future purchasing and consider redistributing or promoting excess stock.',
    });
  }

  const locations = item.locations || [];
  for (const destination of locations) {
    const shortage = Math.max(0, destination.committed_stock - destination.stock_on_hand, -destination.available_stock);
    if (shortage <= 0) continue;
    const donor = locations
      .filter((candidate) => candidate.location_name !== destination.location_name && candidate.available_stock > 0)
      .sort((a, b) => b.available_stock - a.available_stock)[0];
    const transferQty = donor ? Math.min(Math.ceil(shortage), Math.floor(donor.available_stock)) : 0;
    alerts.push({
      ...base,
      id: `${item.item_id}:location:${destination.location_name}`,
      type: 'location_mismatch', severity: transferQty > 0 ? 'warning' : 'critical',
      location: destination.location_name,
      message: `${destination.location_name} is short by ${Math.ceil(shortage)} ${item.unit || 'units'} against committed demand.`,
      recommendation: transferQty > 0
        ? `Request approval to transfer ${transferQty} ${item.unit || 'units'} from ${donor!.location_name}.`
        : 'No other monitored location has available stock; review purchasing or order allocation.',
      transfer: transferQty > 0 ? { from: donor!.location_name, to: destination.location_name, quantity: transferQty } : undefined,
    });
  }

  return alerts;
}

export function analyzeInventory(items: InventoryExceptionInput[]): InventoryException[] {
  const rank: Record<ExceptionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return items.flatMap(analyzeInventoryItem).sort((a, b) => rank[a.severity] - rank[b.severity]);
}
