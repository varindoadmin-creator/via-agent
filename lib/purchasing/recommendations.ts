export type PurchaseRecommendationInput = {
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  vendor_id: string;
  vendor_name: string;
  purchase_rate: number;
  stock_on_hand: number;
  open_sales_order_qty: number;
  incoming_po_qty: number;
  sold_90_days: number;
  lead_time_days: number;
  sales_orders: string[];
  purchase_orders: string[];
};

export type PurchaseRecommendation = PurchaseRecommendationInput & {
  daily_velocity: number;
  safety_stock_qty: number;
  demand_during_lead_time: number;
  projected_available_qty: number;
  recommended_qty: number;
  estimated_cost: number;
  coverage_status: 'uncovered_so' | 'replenishment' | 'covered';
};

export type SupplierPurchaseProposal = {
  vendor_id: string;
  vendor_name: string;
  item_count: number;
  recommended_qty: number;
  estimated_cost: number;
  sales_orders: string[];
  items: PurchaseRecommendation[];
};

const finite = (value: number) => Number.isFinite(value) ? value : 0;

/**
 * Advisory purchasing calculation. Quantities are deliberately rounded up and
 * never written to Zoho by this module.
 *
 * Required stock = unfulfilled confirmed-SO demand + expected sales during the
 * supplier lead time + 14 days of safety stock. Current stock and every open PO
 * quantity still to receive are deducted once.
 */
export function buildPurchaseRecommendation(
  input: PurchaseRecommendationInput,
  safetyDays = 14,
): PurchaseRecommendation {
  const sold90 = Math.max(0, finite(input.sold_90_days));
  const dailyVelocity = sold90 / 90;
  const leadTimeDays = Math.max(1, Math.round(finite(input.lead_time_days) || 30));
  const openDemand = Math.max(0, finite(input.open_sales_order_qty));
  const stock = Math.max(0, finite(input.stock_on_hand));
  const incoming = Math.max(0, finite(input.incoming_po_qty));
  const leadDemand = dailyVelocity * leadTimeDays;
  const safetyStock = dailyVelocity * Math.max(0, safetyDays);
  const projectedAvailable = stock + incoming - openDemand;
  const recommended = Math.max(0, Math.ceil(openDemand + leadDemand + safetyStock - stock - incoming));
  const uncoveredSo = Math.max(0, openDemand - stock - incoming);

  return {
    ...input,
    lead_time_days: leadTimeDays,
    daily_velocity: dailyVelocity,
    safety_stock_qty: Math.ceil(safetyStock),
    demand_during_lead_time: Math.ceil(leadDemand),
    projected_available_qty: projectedAvailable,
    recommended_qty: recommended,
    estimated_cost: recommended * Math.max(0, finite(input.purchase_rate)),
    coverage_status: uncoveredSo > 0 ? 'uncovered_so' : recommended > 0 ? 'replenishment' : 'covered',
  };
}

export function groupRecommendationsBySupplier(
  recommendations: PurchaseRecommendation[],
): SupplierPurchaseProposal[] {
  const groups = new Map<string, PurchaseRecommendation[]>();
  for (const row of recommendations.filter((item) => item.recommended_qty > 0)) {
    const key = row.vendor_id || row.vendor_name || 'UNASSIGNED';
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  }

  return Array.from(groups.entries()).map(([key, items]) => ({
    vendor_id: items[0].vendor_id,
    vendor_name: items[0].vendor_name || (key === 'UNASSIGNED' ? 'Supplier not assigned' : key),
    item_count: items.length,
    recommended_qty: items.reduce((sum, item) => sum + item.recommended_qty, 0),
    estimated_cost: items.reduce((sum, item) => sum + item.estimated_cost, 0),
    sales_orders: Array.from(new Set(items.flatMap((item) => item.sales_orders))).sort(),
    items: [...items].sort((a, b) => {
      if (a.coverage_status !== b.coverage_status) return a.coverage_status === 'uncovered_so' ? -1 : 1;
      return b.estimated_cost - a.estimated_cost;
    }),
  })).sort((a, b) => b.estimated_cost - a.estimated_cost);
}
