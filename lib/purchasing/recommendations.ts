export type ForecastMethod = 'weighted_average';
export type RecommendationUrgency = 'recommended_now' | 'recommended_soon' | 'no_action' | 'insufficient_data' | 'data_error';
export type RecommendationConfidence = 'high' | 'medium' | 'low';

export type MirpoRecommendationConfig = {
  default_lead_time_days: number;
  safety_stock_days: number;
  sales_history_days: number;
  forecasting_method: ForecastMethod;
  minimum_confidence: RecommendationConfidence;
  include_open_sales_orders: boolean;
  ignore_abnormal_periods: boolean;
  vendor_preference: 'item_then_brand';
  warehouse_scope: string;
  currency: string;
  include_tax: boolean;
  tax_rate_percent: number;
};

export const DEFAULT_MIRPO_CONFIG: MirpoRecommendationConfig = {
  default_lead_time_days: 30,
  safety_stock_days: 14,
  sales_history_days: 90,
  forecasting_method: 'weighted_average',
  minimum_confidence: 'low',
  include_open_sales_orders: true,
  ignore_abnormal_periods: true,
  vendor_preference: 'item_then_brand',
  warehouse_scope: 'all',
  currency: 'IDR',
  include_tax: false,
  tax_rate_percent: 0,
};

export type PurchaseRecommendationInput = {
  item_id: string;
  sku: string;
  name: string;
  unit: string;
  category: string;
  warehouse: string;
  vendor_id: string;
  vendor_name: string;
  purchase_rate: number;
  stock_on_hand: number;
  committed_stock: number;
  available_stock: number;
  open_sales_order_qty: number;
  incoming_po_qty: number;
  history_bucket_days: number;
  sold_recent_days: number;
  sold_middle_days: number;
  sold_older_days: number;
  active_sales_periods: number;
  distinct_customer_count: number;
  sales_transaction_count: number;
  retail_demand_score: number;
  returns_qty: number;
  cancelled_qty: number;
  lead_time_days: number;
  reorder_level: number;
  preferred_stock_level: number;
  minimum_order_qty: number;
  order_multiple: number;
  sales_orders: string[];
  purchase_orders: string[];
  mirpo_orders: string[];
  assumptions: string[];
  data_error?: string;
};

export type PurchaseRecommendation = PurchaseRecommendationInput & {
  daily_velocity: number;
  forecast_demand: number;
  safety_stock_qty: number;
  projected_available_qty: number;
  recommended_qty: number;
  estimated_unit_cost: number;
  estimated_cost: number;
  recommended_order_date: string;
  expected_stockout_date: string | null;
  confidence: RecommendationConfidence;
  urgency: RecommendationUrgency;
  explanation: string;
  coverage_status: 'uncovered_so' | 'replenishment' | 'covered';
  calculation: {
    weighted_daily_demand: number;
    replenishment_days: number;
    open_so_demand: number;
    available_stock: number;
    incoming_stock: number;
    raw_suggested_qty: number;
    rounded_suggested_qty: number;
  };
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

export type MirpoPortfolio = {
  target_qty: number;
  recommended_qty: number;
  sell_through_horizon_days: number;
  projected_30d_sales: number;
  projected_30d_sell_through_pct: number;
  safely_absorbable_qty: number;
  excess_risk_qty: number;
  ready_to_order: boolean;
  decision: 'ready' | 'review' | 'insufficient_data';
  explanation: string;
  items: PurchaseRecommendation[];
};

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + Math.round(days));
  return result;
}

export function roundOrderQuantity(quantity: number, minimum: number, multiple: number): number {
  if (quantity <= 0) return 0;
  const min = Math.max(0, finite(minimum));
  const step = Math.max(0, finite(multiple));
  let rounded = Math.max(Math.ceil(quantity), Math.ceil(min));
  if (step > 0) rounded = Math.ceil(rounded / step) * step;
  return rounded;
}

/** Weighted forecast: newest 30-day bucket 60%, middle 30%, oldest 10%. */
export function weightedDailyDemand(input: PurchaseRecommendationInput, ignoreAbnormal = true): { daily: number; spikeIgnored: boolean } {
  const bucketDays = Math.max(1, finite(input.history_bucket_days) || 30);
  const buckets = [input.sold_recent_days, input.sold_middle_days, input.sold_older_days]
    .map((value) => Math.max(0, finite(value) - Math.max(0, finite(input.returns_qty)) / 3) / bucketDays);
  let spikeIgnored = false;
  if (ignoreAbnormal && buckets[0] > Math.max(1, buckets[1], buckets[2]) * 3) {
    buckets[0] = Math.max(buckets[1], buckets[2]);
    spikeIgnored = true;
  }
  return { daily: Math.max(0, buckets[0] * 0.6 + buckets[1] * 0.3 + buckets[2] * 0.1), spikeIgnored };
}

export function buildPurchaseRecommendation(
  input: PurchaseRecommendationInput,
  config: MirpoRecommendationConfig | number = DEFAULT_MIRPO_CONFIG,
  now = new Date(),
): PurchaseRecommendation {
  // Backward compatibility with the first recommendation engine's safetyDays argument.
  const settings = typeof config === 'number' ? { ...DEFAULT_MIRPO_CONFIG, safety_stock_days: config } : config;
  const leadTimeDays = Math.max(1, Math.round(finite(input.lead_time_days) || settings.default_lead_time_days));
  const { daily: dailyVelocity, spikeIgnored } = weightedDailyDemand(input, settings.ignore_abnormal_periods);
  const openDemand = settings.include_open_sales_orders ? Math.max(0, finite(input.open_sales_order_qty) - Math.max(0, finite(input.cancelled_qty))) : 0;
  const available = Math.max(0, finite(input.available_stock));
  const incoming = Math.max(0, finite(input.incoming_po_qty));
  const replenishmentDays = leadTimeDays + Math.max(0, settings.safety_stock_days);
  const forecastDemand = dailyVelocity * leadTimeDays + openDemand;
  // Zoho reorder levels may predate reliable sales history. MIRPO replenishment
  // therefore derives its safety stock only from observed demand.
  const safetyStock = dailyVelocity * settings.safety_stock_days;
  const preferredBuffer = Math.max(0, finite(input.preferred_stock_level) - available - incoming);
  const rawSuggested = Math.max(0, forecastDemand + safetyStock - available - incoming, preferredBuffer);
  const recommended = roundOrderQuantity(rawSuggested, input.minimum_order_qty, input.order_multiple);
  const estimatedUnitCost = Math.max(0, finite(input.purchase_rate)) * (settings.include_tax ? 1 + Math.max(0, finite(settings.tax_rate_percent)) / 100 : 1);
  const projectedAvailable = available + incoming - openDemand;
  const uncoveredSo = Math.max(0, openDemand - available - incoming);
  const daysToStockout = dailyVelocity > 0 ? Math.max(0, available + incoming - openDemand) / dailyVelocity : null;
  const expectedStockoutDate = daysToStockout == null ? null : isoDate(addDays(now, daysToStockout));
  const orderLead = daysToStockout == null ? 0 : Math.max(0, daysToStockout - leadTimeDays);
  const recommendedOrderDate = isoDate(addDays(now, orderLead));

  const hasVendor = Boolean(input.vendor_id || (input.vendor_name && input.vendor_name !== 'Supplier not assigned'));
  const historyQty = input.sold_recent_days + input.sold_middle_days + input.sold_older_days;
  const confidence: RecommendationConfidence = historyQty >= 30 && hasVendor && input.lead_time_days > 0
    ? 'high' : historyQty > 0 && hasVendor ? 'medium' : 'low';
  let urgency: RecommendationUrgency;
  if (input.data_error) urgency = 'data_error';
  else if (!hasVendor || (historyQty <= 0 && openDemand <= 0)) urgency = 'insufficient_data';
  else if (recommended <= 0) urgency = 'no_action';
  else if (uncoveredSo > 0 || daysToStockout == null || daysToStockout <= leadTimeDays) urgency = 'recommended_now';
  else urgency = 'recommended_soon';

  const assumptions = [...input.assumptions];
  if (!input.lead_time_days) assumptions.push(`Lead time fallback: ${settings.default_lead_time_days} days`);
  if (!input.minimum_order_qty) assumptions.push('No minimum order quantity supplied by Zoho');
  if (!input.order_multiple) assumptions.push('No order multiple supplied by Zoho');
  if (spikeIgnored) assumptions.push('Recent abnormal demand spike was ignored');
  const reason = urgency === 'no_action'
    ? `Available plus incoming stock covers ${replenishmentDays} days of forecast demand.`
    : urgency === 'insufficient_data'
      ? `Recommendation needs ${!hasVendor ? 'a preferred vendor' : 'sales or open-order demand'} before action.`
      : `${Math.ceil(forecastDemand)} ${input.unit} forecast demand plus ${Math.ceil(safetyStock)} safety stock, less ${available} available and ${incoming} incoming.`;

  return {
    ...input,
    assumptions: Array.from(new Set(assumptions)),
    lead_time_days: leadTimeDays,
    daily_velocity: dailyVelocity,
    forecast_demand: Math.ceil(forecastDemand),
    safety_stock_qty: Math.ceil(safetyStock),
    projected_available_qty: projectedAvailable,
    recommended_qty: recommended,
    estimated_unit_cost: estimatedUnitCost,
    estimated_cost: recommended * estimatedUnitCost,
    recommended_order_date: recommendedOrderDate,
    expected_stockout_date: expectedStockoutDate,
    confidence,
    urgency,
    explanation: reason,
    coverage_status: uncoveredSo > 0 ? 'uncovered_so' : recommended > 0 ? 'replenishment' : 'covered',
    calculation: {
      weighted_daily_demand: dailyVelocity,
      replenishment_days: replenishmentDays,
      open_so_demand: openDemand,
      available_stock: available,
      incoming_stock: incoming,
      raw_suggested_qty: rawSuggested,
      rounded_suggested_qty: recommended,
    },
  };
}

export function groupRecommendationsBySupplier(recommendations: PurchaseRecommendation[]): SupplierPurchaseProposal[] {
  const groups = new Map<string, PurchaseRecommendation[]>();
  for (const row of recommendations.filter((item) => item.recommended_qty > 0 && item.urgency !== 'data_error')) {
    const key = row.vendor_id || row.vendor_name || 'UNASSIGNED';
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return Array.from(groups.entries()).map(([key, items]) => ({
    vendor_id: items[0].vendor_id,
    vendor_name: items[0].vendor_name || (key === 'UNASSIGNED' ? 'Supplier not assigned' : key),
    item_count: items.length,
    recommended_qty: items.reduce((sum, item) => sum + item.recommended_qty, 0),
    estimated_cost: items.reduce((sum, item) => sum + item.estimated_cost, 0),
    sales_orders: Array.from(new Set(items.flatMap((item) => item.sales_orders))).sort(),
    items: [...items].sort((a, b) => a.urgency.localeCompare(b.urgency) || b.estimated_cost - a.estimated_cost),
  })).sort((a, b) => b.estimated_cost - a.estimated_cost);
}

/**
 * Builds one policy-sized LAMITAK MIRPO portfolio. The first allocation pass only
 * fills stock gaps that forecast to sell within the horizon. If those gaps do not
 * total the policy quantity, the balance is assigned to the fastest movers so the
 * user can review a complete 600-sheet proposal without hiding the excess risk.
 */
export function buildMirpoPortfolio(
  rows: PurchaseRecommendation[],
  targetQty = 600,
  horizonDays = 30,
): MirpoPortfolio {
  const target = Math.max(0, Math.round(finite(targetQty)));
  const horizon = Math.max(1, Math.round(finite(horizonDays)));
  const candidates = rows.filter((row) =>
    row.daily_velocity > 0 &&
    row.urgency !== 'data_error' &&
    row.estimated_unit_cost <= 1_000_000 &&
    (row.active_sales_periods >= 2 || row.distinct_customer_count >= 3),
  );
  if (!target || candidates.length === 0) {
    return {
      target_qty: target, recommended_qty: 0, sell_through_horizon_days: horizon,
      projected_30d_sales: 0, projected_30d_sell_through_pct: 0,
      safely_absorbable_qty: 0, excess_risk_qty: 0, ready_to_order: false,
      decision: 'insufficient_data',
      explanation: 'No reliable LAMITAK HPL sales velocity is available for a MIRPO allocation.',
      items: rows.map((row) => ({ ...row, recommended_qty: 0, estimated_cost: 0 })),
    };
  }

  const allocation = new Map<string, number>();
  const safeNeed = new Map<string, number>();
  for (const row of candidates) {
    const demand = row.daily_velocity * horizon + Math.max(0, row.open_sales_order_qty);
    const supplyBeforeMirpo = Math.max(0, row.available_stock) + Math.max(0, row.incoming_po_qty);
    safeNeed.set(row.item_id, Math.max(0, Math.floor(demand - supplyBeforeMirpo)));
    allocation.set(row.item_id, 0);
  }

  // Greedily fill the largest genuine shortage first. This never creates dead stock.
  let remaining = target;
  while (remaining > 0) {
    const next = candidates
      .filter((row) => (allocation.get(row.item_id) || 0) < (safeNeed.get(row.item_id) || 0))
      .sort((a, b) => b.retail_demand_score - a.retail_demand_score || ((safeNeed.get(b.item_id) || 0) - (allocation.get(b.item_id) || 0)) - ((safeNeed.get(a.item_id) || 0) - (allocation.get(a.item_id) || 0)) || b.daily_velocity - a.daily_velocity)[0];
    if (!next) break;
    allocation.set(next.item_id, (allocation.get(next.item_id) || 0) + 1);
    remaining--;
  }
  const safelyAbsorbable = target - remaining;

  // Policy still requires a complete 600-sheet proposal. Spread the review-risk
  // balance by sales velocity, one sheet at a time, favouring under-allocated movers.
  const totalRetailScore = candidates.reduce((sum, row) => sum + Math.max(1, row.retail_demand_score), 0);
  while (remaining > 0) {
    const next = [...candidates].sort((a, b) => {
      const targetA = target * Math.max(1, a.retail_demand_score) / totalRetailScore;
      const targetB = target * Math.max(1, b.retail_demand_score) / totalRetailScore;
      return (targetB - (allocation.get(b.item_id) || 0)) - (targetA - (allocation.get(a.item_id) || 0)) || b.daily_velocity - a.daily_velocity;
    })[0];
    allocation.set(next.item_id, (allocation.get(next.item_id) || 0) + 1);
    remaining--;
  }

  let projectedSales = 0;
  const items = rows.map((row) => {
    const quantity = allocation.get(row.item_id) || 0;
    const demand = row.daily_velocity * horizon + Math.max(0, row.open_sales_order_qty);
    const supply = Math.max(0, row.available_stock) + Math.max(0, row.incoming_po_qty) + quantity;
    const itemSales = quantity > 0 ? Math.max(0, Math.min(quantity, demand - Math.max(0, row.available_stock) - Math.max(0, row.incoming_po_qty))) : 0;
    projectedSales += itemSales;
    const safe = safeNeed.get(row.item_id) || 0;
    const risk = Math.max(0, quantity - safe);
    return {
      ...row,
      recommended_qty: quantity,
      estimated_cost: quantity * row.estimated_unit_cost,
      urgency: quantity > 0 ? row.urgency : 'no_action' as RecommendationUrgency,
      explanation: quantity > 0
        ? `${quantity} sheets selected for the 600-sheet LAMITAK MIRPO; sold in ${row.active_sales_periods}/3 periods across ${row.distinct_customer_count} customers and ${row.sales_transaction_count} invoices. ${Math.min(quantity, safe)} are supported by the 30-day net demand gap${risk ? ` and ${risk} require review because they exceed that gap` : ''}.`
        : row.estimated_unit_cost > 1_000_000
          ? `Not selected: purchase rate ${Math.round(row.estimated_unit_cost).toLocaleString('id-ID')} exceeds the Rp1,000,000 MIRPO retail ceiling.`
          : row.active_sales_periods < 2 && row.distinct_customer_count < 3
            ? `Not selected: demand is not recurring enough (${row.active_sales_periods}/3 periods, ${row.distinct_customer_count} customers).`
            : `Not selected: existing and incoming stock rank ahead of this item's 30-day demand.`,
      calculation: { ...row.calculation, raw_suggested_qty: safe, rounded_suggested_qty: quantity },
    };
  });
  const pct = target > 0 ? Math.min(100, projectedSales / target * 100) : 0;
  const ready = safelyAbsorbable >= target && pct >= 99.5;
  return {
    target_qty: target,
    recommended_qty: items.reduce((sum, row) => sum + row.recommended_qty, 0),
    sell_through_horizon_days: horizon,
    projected_30d_sales: Math.round(projectedSales * 10) / 10,
    projected_30d_sell_through_pct: Math.round(pct * 10) / 10,
    safely_absorbable_qty: safelyAbsorbable,
    excess_risk_qty: Math.max(0, target - safelyAbsorbable),
    ready_to_order: ready,
    decision: ready ? 'ready' : 'review',
    explanation: ready
      ? `Current demand supports all ${target} sheets selling through within ${horizon} days.`
      : `Only ${safelyAbsorbable} of ${target} sheets are supported by the current ${horizon}-day net demand gap. Review or defer the ${target - safelyAbsorbable}-sheet risk balance to minimize dead stock.`,
    items,
  };
}

export function applyManualDraftState<T extends { item_id: string; recommended_qty: number; vendor_name: string; recommended_order_date: string }>(
  rows: T[],
  adjustments: Record<string, { quantity?: number; vendor_name?: string; required_date?: string }>,
  exclusions: Record<string, string>,
): Array<T & { excluded: boolean; exclusion_reason: string }> {
  return rows.map((row) => ({
    ...row,
    recommended_qty: Math.max(0, adjustments[row.item_id]?.quantity ?? row.recommended_qty),
    vendor_name: adjustments[row.item_id]?.vendor_name || row.vendor_name,
    recommended_order_date: adjustments[row.item_id]?.required_date || row.recommended_order_date,
    excluded: Object.prototype.hasOwnProperty.call(exclusions, row.item_id),
    exclusion_reason: exclusions[row.item_id] || '',
  }));
}
