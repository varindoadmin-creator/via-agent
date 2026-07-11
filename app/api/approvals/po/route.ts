import { NextRequest, NextResponse } from 'next/server';
import { zohoRequest } from '@/lib/zoho/client';
import { getItemWithStock, type ItemStockSummary } from '@/lib/zoho/items';
import { expectedWarehouseForCustomer, getCustomerRoutingInfo } from '@/lib/warehouseRouting';

export const maxDuration = 60;

function n(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function s(value: unknown): string {
  return value == null ? '' : String(value);
}

function groupKey(itemId: string, locationId: string): string {
  return `${itemId}::${locationId}`;
}

async function fetchAllPages(path: string, key: string, queryParams: Record<string, string | number> = {}): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await zohoRequest<Record<string, unknown>>(path, { queryParams: { ...queryParams, per_page: 200, page } });
    const batch = (res[key] || []) as Record<string, unknown>[];
    items.push(...batch);
    hasMore = batch.length === 200;
    page++;
    if (page > 10) break;
  }
  return items;
}

async function safeFetchAllPages(path: string, key: string, queryParams: Record<string, string | number>, label: string) {
  try {
    return await fetchAllPages(path, key, queryParams);
  } catch (err) {
    console.warn(`[PO Approval] Skipping ${label}: ${path}`, err);
    return [] as Record<string, unknown>[];
  }
}

async function mapBatched<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

// ─── Raw data shapes ────────────────────────────────────────────────────────

interface RawPOLineItem {
  order: number;
  item_id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  location_id: string;
  location_name: string;
}

interface PendingPO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  location_name: string;
  total: number;
  line_items: RawPOLineItem[];
}

interface SODemandLine {
  item_id: string;
  name: string;
  sku: string;
  location_id: string;
  location_name: string;
  need: number; // quantity - quantity_shipped, always > 0
}

interface ConfirmedSO {
  salesorder_id: string;
  salesorder_number: string;
  customer_id: string;
  customer_name: string;
  date: string;
  line_items: SODemandLine[];
}

async function getPODetail(id: string): Promise<PendingPO | null> {
  try {
    const res = await zohoRequest<{ purchaseorder?: Record<string, unknown> }>(`/purchaseorders/${id}`);
    const po = res.purchaseorder;
    if (!po) return null;
    const lineItems = ((po.line_items || []) as Record<string, unknown>[]).map((li, order): RawPOLineItem => ({
      order,
      item_id: s(li.item_id),
      name: s(li.name),
      sku: s(li.sku || li.item_code),
      unit: s(li.unit || 'sht'),
      quantity: n(li.quantity),
      rate: n(li.rate),
      amount: n(li.item_total || li.amount),
      location_id: s(li.location_id),
      location_name: s(li.location_name),
    }));
    return {
      purchaseorder_id: s(po.purchaseorder_id),
      purchaseorder_number: s(po.purchaseorder_number),
      vendor_name: s(po.vendor_name),
      date: s(po.date),
      location_name: s(po.location_name),
      total: n(po.total),
      line_items: lineItems,
    };
  } catch {
    return null;
  }
}

async function getSODetailForMatching(id: string): Promise<ConfirmedSO | null> {
  try {
    const res = await zohoRequest<{ salesorder?: Record<string, unknown> }>(`/salesorders/${id}`);
    const so = res.salesorder;
    if (!so) return null;
    const lineItems = ((so.line_items || []) as Record<string, unknown>[])
      .map((li): SODemandLine => ({
        item_id: s(li.item_id),
        name: s(li.name),
        sku: s(li.sku || li.item_code),
        location_id: s(li.location_id),
        location_name: s(li.location_name),
        need: Math.max(0, n(li.quantity) - n(li.quantity_shipped)),
      }))
      .filter(li => li.item_id && li.need > 0);
    return {
      salesorder_id: s(so.salesorder_id),
      salesorder_number: s(so.salesorder_number),
      customer_id: s(so.customer_id),
      customer_name: s(so.customer_name),
      date: s(so.date),
      line_items: lineItems,
    };
  } catch {
    return null;
  }
}

// ─── Matching output shapes ─────────────────────────────────────────────────

interface MatchRow {
  salesorder_number: string;
  customer_name: string;
  customer_region: string;
  so_quantity: number;
  fulfilled_qty: number;
}

type MatchStatus = 'matched' | 'multi_match' | 'partial_so' | 'excess_stock' | 'for_stock' | 'needs_review';

interface ComputedLineItem {
  order: number;
  item_id: string;
  name: string;
  sku: string;
  unit: string;
  location_name: string;
  quantity: number;
  rate: number;
  amount: number;
  matches: MatchRow[];
  matched_qty: number;
  stock_qty: number;
  match_status: MatchStatus;
}

interface RegionMixWarning {
  regions: string[];
  detail: string;
}

interface ComputedPO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  location_name: string;
  total: number;
  status: 'OK' | 'REGION_MIX' | 'NEEDS_REVIEW';
  region_mix_warning: RegionMixWarning | null;
  line_items: Omit<ComputedLineItem, 'order'>[];
}

interface UncoveredDemand {
  item_id: string;
  name: string;
  sku: string;
  location_name: string;
  salesorder_number: string;
  customer_name: string;
  qty: number;
}

// ─── Core computation ────────────────────────────────────────────────────────
// Everything is keyed by (item_id, location_id), not item_id alone — a PO destined
// for HEAD OFFICE must never be treated as covering SO demand at HUB-MDN.

async function computeApprovalData(): Promise<{ purchase_orders: ComputedPO[]; uncovered_demand: UncoveredDemand[] }> {
  const [poList, soList] = await Promise.all([
    safeFetchAllPages('/purchaseorders', 'purchaseorders', { status: 'pending_approval', sort_column: 'date', sort_order: 'A' }, 'pending approval POs'),
    safeFetchAllPages('/salesorders', 'salesorders', { status: 'confirmed', sort_column: 'date', sort_order: 'A' }, 'confirmed SOs'),
  ]);

  const [poDetails, soDetails] = await Promise.all([
    mapBatched(poList, 8, po => getPODetail(s(po.purchaseorder_id))),
    mapBatched(soList, 8, so => getSODetailForMatching(s(so.salesorder_id))),
  ]);

  const pendingPOs = poDetails.filter((p): p is PendingPO => p !== null);
  const confirmedSOs = soDetails.filter((v): v is ConfirmedSO => v !== null);

  // Customer region lookup — cached per unique customer, used for the "same region" rule.
  const uniqueCustomerIds = Array.from(new Set(confirmedSOs.map(so => so.customer_id).filter(Boolean)));
  const regionResults = await mapBatched(uniqueCustomerIds, 8, id => getCustomerRoutingInfo(id));
  const regionByCustomer = new Map<string, string>();
  uniqueCustomerIds.forEach((id, idx) => {
    const { city, cfRegion } = regionResults[idx];
    regionByCustomer.set(id, expectedWarehouseForCustomer(city, cfRegion));
  });

  // Stock lookup — one Zoho call per unique item, covering every location at once.
  const uniqueItemIds = Array.from(new Set([
    ...pendingPOs.flatMap(po => po.line_items.map(i => i.item_id).filter(Boolean)),
    ...confirmedSOs.flatMap(so => so.line_items.map(i => i.item_id)),
  ]));
  const stockResults = await mapBatched(uniqueItemIds, 8, id => getItemWithStock(id));
  const stockByItem = new Map<string, ItemStockSummary>();
  uniqueItemIds.forEach((id, idx) => { const r = stockResults[idx]; if (r) stockByItem.set(id, r); });

  function stockOnHandAt(itemId: string, locationId: string): number {
    const loc = stockByItem.get(itemId)?.by_location.find(l => l.location_id === locationId);
    return loc ? loc.stock_on_hand : 0;
  }

  // Group confirmed SO demand by (item, location), oldest SO first.
  const soByGroup = new Map<string, Array<{ so: ConfirmedSO; item: SODemandLine }>>();
  for (const so of confirmedSOs) {
    for (const item of so.line_items) {
      const k = groupKey(item.item_id, item.location_id);
      if (!soByGroup.has(k)) soByGroup.set(k, []);
      soByGroup.get(k)!.push({ so, item });
    }
  }
  for (const entries of soByGroup.values()) entries.sort((a, b) => a.so.date.localeCompare(b.so.date));

  // For each group: the portion of demand within stock_on_hand is already covered;
  // everything beyond it is a shortfall queue, attributed to the specific SOs driving it
  // (oldest SOs get stock first — a reasonable, explainable FIFO allocation).
  interface ShortfallEntry { salesorder_number: string; customer_name: string; customer_region: string; original_qty: number; qty: number }
  const shortfallByGroup = new Map<string, ShortfallEntry[]>();
  for (const [k, entries] of soByGroup) {
    const [itemId, locationId] = k.split('::');
    const stockOnHand = stockOnHandAt(itemId, locationId);
    let cumulative = 0;
    const queue: ShortfallEntry[] = [];
    for (const { so, item } of entries) {
      const before = cumulative;
      cumulative += item.need;
      const coveredByStock = Math.max(0, Math.min(cumulative, stockOnHand) - before);
      const shortfall = item.need - coveredByStock;
      if (shortfall > 0) {
        queue.push({
          salesorder_number: so.salesorder_number,
          customer_name: so.customer_name,
          customer_region: regionByCustomer.get(so.customer_id) || '',
          original_qty: item.need,
          qty: shortfall,
        });
      }
    }
    shortfallByGroup.set(k, queue);
  }

  // Mutable remaining-quantity view of each shortfall queue, consumed as pending POs allocate against it.
  const remainingQueues = new Map<string, Array<{ entry: ShortfallEntry; remaining: number }>>();
  for (const [k, queue] of shortfallByGroup) remainingQueues.set(k, queue.map(e => ({ entry: e, remaining: e.qty })));

  // Group pending PO line items by (item, location), oldest PO first, so the earliest-raised
  // PO gets first claim on real SO need — anything left over is buffer stock.
  const poByGroup = new Map<string, Array<{ po: PendingPO; item: RawPOLineItem }>>();
  for (const po of pendingPOs) {
    for (const item of po.line_items) {
      if (!item.item_id) continue;
      const k = groupKey(item.item_id, item.location_id);
      if (!poByGroup.has(k)) poByGroup.set(k, []);
      poByGroup.get(k)!.push({ po, item });
    }
  }
  for (const entries of poByGroup.values()) entries.sort((a, b) => a.po.date.localeCompare(b.po.date));

  const lineItemsByPO = new Map<string, ComputedLineItem[]>();
  function pushLineItem(poId: string, item: ComputedLineItem) {
    if (!lineItemsByPO.has(poId)) lineItemsByPO.set(poId, []);
    lineItemsByPO.get(poId)!.push(item);
  }

  for (const [k, poEntries] of poByGroup) {
    const queue = remainingQueues.get(k) || [];
    let qIdx = 0;
    for (const { po, item } of poEntries) {
      let remaining = item.quantity;
      const matches: MatchRow[] = [];
      while (remaining > 0 && qIdx < queue.length) {
        const slot = queue[qIdx];
        if (slot.remaining <= 0) { qIdx++; continue; }
        const take = Math.min(remaining, slot.remaining);
        matches.push({
          salesorder_number: slot.entry.salesorder_number,
          customer_name: slot.entry.customer_name,
          customer_region: slot.entry.customer_region,
          so_quantity: slot.entry.original_qty,
          fulfilled_qty: take,
        });
        slot.remaining -= take;
        remaining -= take;
        if (slot.remaining <= 0) qIdx++;
      }
      const matched_qty = item.quantity - remaining;
      const stock_qty = remaining;

      let match_status: MatchStatus;
      if (!item.item_id) match_status = 'needs_review';
      else if (matches.length === 0) match_status = 'for_stock';
      else if (matches.length === 1 && stock_qty === 0) match_status = matches[0].fulfilled_qty >= matches[0].so_quantity ? 'matched' : 'partial_so';
      else if (matches.length > 1 && stock_qty === 0) match_status = 'multi_match';
      else match_status = 'excess_stock';

      pushLineItem(po.purchaseorder_id, {
        order: item.order, item_id: item.item_id, name: item.name, sku: item.sku, unit: item.unit,
        location_name: item.location_name, quantity: item.quantity, rate: item.rate, amount: item.amount,
        matches, matched_qty, stock_qty, match_status,
      });
    }
  }

  // Line items with no item_id (custom/blank rows) never entered a group above — flag for manual review.
  for (const po of pendingPOs) {
    for (const item of po.line_items) {
      if (item.item_id) continue;
      pushLineItem(po.purchaseorder_id, {
        order: item.order, item_id: '', name: item.name, sku: item.sku, unit: item.unit,
        location_name: item.location_name, quantity: item.quantity, rate: item.rate, amount: item.amount,
        matches: [], matched_qty: 0, stock_qty: item.quantity, match_status: 'needs_review',
      });
    }
  }

  const STATUS_ORDER: Record<ComputedPO['status'], number> = { NEEDS_REVIEW: 0, REGION_MIX: 1, OK: 2 };

  const purchase_orders: ComputedPO[] = pendingPOs.map(po => {
    const lineItems = (lineItemsByPO.get(po.purchaseorder_id) || []).sort((a, b) => a.order - b.order);

    let status: ComputedPO['status'] = 'OK';
    let region_mix_warning: RegionMixWarning | null = null;

    if (lineItems.some(li => li.match_status === 'needs_review')) {
      status = 'NEEDS_REVIEW';
    } else {
      const regionToSOs = new Map<string, Set<string>>();
      for (const li of lineItems) {
        for (const m of li.matches) {
          if (!m.customer_region) continue; // unknown region doesn't itself count as a "mix"
          if (!regionToSOs.has(m.customer_region)) regionToSOs.set(m.customer_region, new Set());
          regionToSOs.get(m.customer_region)!.add(m.salesorder_number);
        }
      }
      if (regionToSOs.size > 1) {
        status = 'REGION_MIX';
        const regions = Array.from(regionToSOs.keys());
        region_mix_warning = {
          regions,
          detail: regions.map(r => `${r}: ${Array.from(regionToSOs.get(r)!).join(', ')}`).join(' | '),
        };
      }
    }

    return {
      purchaseorder_id: po.purchaseorder_id,
      purchaseorder_number: po.purchaseorder_number,
      vendor_name: po.vendor_name,
      date: po.date,
      location_name: po.location_name,
      total: po.total,
      status,
      region_mix_warning,
      line_items: lineItems.map(({ order: _order, ...rest }) => rest),
    };
  }).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.date.localeCompare(b.date));

  const uncovered_demand: UncoveredDemand[] = [];
  for (const [k, queue] of remainingQueues) {
    const [itemId] = k.split('::');
    const sample = (soByGroup.get(k) || [])[0]?.item;
    for (const slot of queue) {
      if (slot.remaining <= 0) continue;
      uncovered_demand.push({
        item_id: itemId,
        name: sample?.name || '',
        sku: sample?.sku || '',
        location_name: sample?.location_name || '',
        salesorder_number: slot.entry.salesorder_number,
        customer_name: slot.entry.customer_name,
        qty: slot.remaining,
      });
    }
  }
  uncovered_demand.sort((a, b) => a.location_name.localeCompare(b.location_name) || a.name.localeCompare(b.name));

  return { purchase_orders, uncovered_demand };
}

// ─── Route handlers ─────────────────────────────────────────────────────────

export async function GET() {
  try {
    const data = await computeApprovalData();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('[PO Approval] GET error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { purchaseorder_ids } = body as { purchaseorder_ids?: string[] };
    if (!purchaseorder_ids?.length) return NextResponse.json({ success: false, error: 'purchaseorder_ids required' }, { status: 400 });

    // Re-run the full computation server-side so approval is gated on fresh data,
    // not whatever the client happened to have on screen.
    const { purchase_orders } = await computeApprovalData();
    const byId = new Map(purchase_orders.map(po => [po.purchaseorder_id, po]));

    const results: Array<{ purchaseorder_id: string; purchaseorder_number: string; success: boolean; error?: string }> = [];

    for (const poId of purchaseorder_ids) {
      const po = byId.get(poId);
      try {
        if (!po) throw new Error('Purchase Order not found or no longer pending approval.');
        if (po.status === 'REGION_MIX') {
          throw new Error(`Cannot approve: matched Sales Orders span multiple regions (${po.region_mix_warning?.regions.join(', ')}).`);
        }
        if (po.status === 'NEEDS_REVIEW') {
          throw new Error('Cannot approve: one or more line items need manual review (missing item on the PO).');
        }

        const detail = await zohoRequest<{ purchaseorder?: Record<string, unknown> }>(`/purchaseorders/${poId}`);
        if (!detail.purchaseorder) throw new Error('Purchase Order not found in Zoho.');
        if (s(detail.purchaseorder.status) !== 'pending_approval') {
          throw new Error(`Only Pending Approval POs can be approved (current: ${s(detail.purchaseorder.status)})`);
        }

        await zohoRequest(`/purchaseorders/${poId}/status/open`, { method: 'POST', body: {} });
        results.push({ purchaseorder_id: poId, purchaseorder_number: po.purchaseorder_number, success: true });
      } catch (e) {
        results.push({ purchaseorder_id: poId, purchaseorder_number: po?.purchaseorder_number || poId, success: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return NextResponse.json({
      success: true,
      approved: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    console.error('[PO Approval] POST error:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
