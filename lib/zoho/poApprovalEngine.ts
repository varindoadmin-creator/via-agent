// ─── PO Approval matching engine ───────────────────────────────────────────────
// Single source of truth for matching Pending Approval Purchase Orders against
// Confirmed Sales Order demand and current stock. Used by both /api/approvals/po
// (the dedicated approval page) and /api/purchases (the Pending Approval section
// of the Purchases page) so the two surfaces can never drift out of sync again.
// Server-side only. Never import in client components.

import { zohoRequest } from '@/lib/zoho/client';
import { getItemWithStock, type ItemStockSummary } from '@/lib/zoho/items';
import { expectedWarehouseForCustomer, getCustomerRoutingInfo, normalizeWarehouse } from '@/lib/warehouseRouting';
import type { Role } from '@/lib/auth';

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
  current_sub_status: string;
  line_items: SODemandLine[];
}

// Zoho's own confirmed-SO sub-status codes (same as app/api/so-stock-check/route.ts).
// 'cs_awaitin' ("Ordered") means a PO already exists for this SO's demand — even if that
// PO isn't sitting in Pending Approval right now (it may already be open/issued), so this
// demand shouldn't be re-flagged as uncovered. 'cs_readyfo' ("Stock Ready") means Admin has
// already confirmed inventory covers this SO — it never needed a PO, so treat it the same way.
const SO_SUB_STATUS_ORDERED = 'cs_awaitin';
const SO_SUB_STATUS_STOCK_READY = 'cs_readyfo';

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
      current_sub_status: s(so.current_sub_status),
      line_items: lineItems,
    };
  } catch {
    return null;
  }
}

// ─── Matching output shapes ─────────────────────────────────────────────────

export interface MatchRow {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  customer_region: string;
  so_quantity: number;
  fulfilled_qty: number;
  transfer_qty: number;
  fully_covered: boolean;
}

export type MatchStatus = 'matched' | 'multi_match' | 'partial_so' | 'excess_stock' | 'for_stock' | 'needs_review';

export interface ComputedLineItem {
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
  stock_on_hand: number;
  match_status: MatchStatus;
}

export interface RegionMixWarning {
  regions: string[];
  detail: string;
}

export interface ComputedPO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  location_name: string;
  total: number;
  status: 'OK' | 'PARTIAL' | 'REGION_MIX' | 'NEEDS_REVIEW';
  region_mix_warning: RegionMixWarning | null;
  line_items: Omit<ComputedLineItem, 'order'>[];
}

export interface UncoveredDemand {
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

export async function computeApprovalData(): Promise<{ purchase_orders: ComputedPO[]; uncovered_demand: UncoveredDemand[] }> {
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
  interface ShortfallEntry { salesorder_id: string; salesorder_number: string; customer_name: string; customer_region: string; location_name: string; date: string; original_qty: number; qty: number; transfer_qty: number; excluded_from_demand: boolean }
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
          salesorder_id: so.salesorder_id,
          salesorder_number: so.salesorder_number,
          customer_name: so.customer_name,
          customer_region: regionByCustomer.get(so.customer_id) || '',
          location_name: item.location_name,
          date: so.date,
          original_qty: item.need,
          qty: shortfall,
          transfer_qty: 0,
          excluded_from_demand: so.current_sub_status === SO_SUB_STATUS_ORDERED || so.current_sub_status === SO_SUB_STATUS_STOCK_READY,
        });
      }
    }
    shortfallByGroup.set(k, queue);
  }

  // ─── HEAD OFFICE → HUB transfer allowance ──────────────────────────────────
  // Varindo's actual practice: a HUB-BDG/HUB-MDN shortfall is first checked against
  // HEAD OFFICE inventory — stock gets physically transferred over rather than
  // triggering a new purchase. So any HEAD OFFICE stock left over after covering
  // HEAD OFFICE's *own* confirmed SO demand counts as available to shrink hub
  // shortfalls too (oldest hub SO first, across both hubs, since it's one shared
  // pool of transferable stock). HEAD OFFICE's own group is untouched — it always
  // gets first claim on its own stock.
  const HEAD_OFFICE_LOCATION_ID = process.env.ZOHO_LOCATION_HO || '8607767000000093103';
  const itemIdsWithHubShortfall = Array.from(new Set(
    Array.from(shortfallByGroup.keys())
      .filter(k => k.split('::')[1] !== HEAD_OFFICE_LOCATION_ID)
      .map(k => k.split('::')[0])
  ));
  for (const itemId of itemIdsWithHubShortfall) {
    const hoKey = groupKey(itemId, HEAD_OFFICE_LOCATION_ID);
    const hoStock = stockOnHandAt(itemId, HEAD_OFFICE_LOCATION_ID);
    const hoTotalNeed = (soByGroup.get(hoKey) || []).reduce((sum, e) => sum + e.item.need, 0);
    let hoSurplus = Math.max(0, hoStock - hoTotalNeed);
    if (hoSurplus <= 0) continue;

    const hubEntries: ShortfallEntry[] = [];
    for (const [k, queue] of shortfallByGroup) {
      const [kItemId, kLocationId] = k.split('::');
      if (kItemId !== itemId || kLocationId === HEAD_OFFICE_LOCATION_ID) continue;
      hubEntries.push(...queue);
    }
    hubEntries.sort((a, b) => a.date.localeCompare(b.date));

    for (const entry of hubEntries) {
      if (hoSurplus <= 0) break;
      if (entry.qty <= 0) continue;
      const take = Math.min(entry.qty, hoSurplus);
      entry.qty -= take;
      entry.transfer_qty += take;
      hoSurplus -= take;
    }
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
    const [groupItemId, groupLocationId] = k.split('::');
    const stockOnHand = stockOnHandAt(groupItemId, groupLocationId);
    const queue = remainingQueues.get(k) || [];
    let qIdx = 0;
    for (const { po, item } of poEntries) {
      let remaining = item.quantity;
      const matches: MatchRow[] = [];
      while (remaining > 0 && qIdx < queue.length) {
        const slot = queue[qIdx];
        if (slot.remaining <= 0) { qIdx++; continue; }
        const take = Math.min(remaining, slot.remaining);
        slot.remaining -= take;
        matches.push({
          salesorder_id: slot.entry.salesorder_id,
          salesorder_number: slot.entry.salesorder_number,
          customer_name: slot.entry.customer_name,
          customer_region: slot.entry.customer_region,
          so_quantity: slot.entry.original_qty,
          fulfilled_qty: take,
          // Portion of this SO's need that's covered not by this PO or local stock, but by
          // a HEAD OFFICE → HUB transfer of HEAD OFFICE's own surplus stock (see the
          // "HEAD OFFICE → HUB transfer allowance" pass above) — already subtracted out of
          // slot.remaining, so the PO genuinely only needs to cover what's left.
          transfer_qty: slot.entry.transfer_qty,
          // Whether this SO's shortfall (its need beyond stock already on hand, and beyond
          // any HEAD OFFICE transfer) is now fully drained — possibly by this PO alone,
          // possibly combined with earlier POs that already claimed part of the same slot.
          // This, not a raw quantity compare against the SO's full original need, is what
          // "matched" vs "partial_so" means: stock_on_hand and transferable HEAD OFFICE
          // stock already legitimately cover part of the SO, so a PO only needs to cover
          // the remainder to fully clear it.
          fully_covered: slot.remaining <= 0,
        });
        remaining -= take;
        if (slot.remaining <= 0) qIdx++;
      }
      const matched_qty = item.quantity - remaining;
      const stock_qty = remaining;
      const allFullyCovered = matches.length > 0 && matches.every(m => m.fully_covered);

      let match_status: MatchStatus;
      if (!item.item_id) match_status = 'needs_review';
      else if (matches.length === 0) match_status = 'for_stock';
      else if (stock_qty > 0) match_status = 'excess_stock';
      else if (matches.length === 1) match_status = allFullyCovered ? 'matched' : 'partial_so';
      else match_status = allFullyCovered ? 'multi_match' : 'partial_so';

      pushLineItem(po.purchaseorder_id, {
        order: item.order, item_id: item.item_id, name: item.name, sku: item.sku, unit: item.unit,
        location_name: item.location_name, quantity: item.quantity, rate: item.rate, amount: item.amount,
        matches, matched_qty, stock_qty, stock_on_hand: stockOnHand, match_status,
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
        matches: [], matched_qty: 0, stock_qty: item.quantity, stock_on_hand: 0, match_status: 'needs_review',
      });
    }
  }

  const STATUS_ORDER: Record<ComputedPO['status'], number> = { NEEDS_REVIEW: 0, REGION_MIX: 1, PARTIAL: 2, OK: 3 };

  const purchase_orders: ComputedPO[] = pendingPOs.map(po => {
    const lineItems = (lineItemsByPO.get(po.purchaseorder_id) || []).sort((a, b) => a.order - b.order);

    let status: ComputedPO['status'] = 'OK';
    let region_mix_warning: RegionMixWarning | null = null;

    if (lineItems.some(li => li.match_status === 'needs_review')) {
      status = 'NEEDS_REVIEW';
    } else {
      const regionToSOs = new Map<string, Set<string>>();
      const noteRegion = (region: string, soNumber?: string) => {
        if (!region) return;
        if (!regionToSOs.has(region)) regionToSOs.set(region, new Set());
        if (soNumber) regionToSOs.get(region)!.add(soNumber);
      };

      // Directly matched demand — this PO's line items genuinely fulfill these SOs.
      for (const li of lineItems) {
        for (const m of li.matches) {
          noteRegion(m.customer_region, m.salesorder_number); // unknown region doesn't itself count as a "mix"
        }
      }

      // Warehouse mismatch: the PO's own Warehouse Location for a matched line item must
      // equal the expected warehouse for the SO customer it's fulfilling (BDG-HUB -> HUB-BDG,
      // MDN-HUB -> HUB-MDN, HEAD OFFICE -> HEAD OFFICE) — otherwise the purchased stock lands
      // in the wrong location's inventory. This catches a mismatch even when the PO and the SO
      // agree with each other (so the match itself "succeeded") but both point at a warehouse
      // that's wrong for the customer's actual region.
      const warehouseMismatchNotes: string[] = [];
      for (const li of lineItems) {
        for (const m of li.matches) {
          if (!m.customer_region) continue;
          if (normalizeWarehouse(m.customer_region) === normalizeWarehouse(li.location_name)) continue;
          noteRegion(li.location_name);
          noteRegion(m.customer_region, m.salesorder_number);
          warehouseMismatchNotes.push(
            `${li.name} (${li.sku}) is set to warehouse ${li.location_name}, but ${m.salesorder_number} ${m.customer_name} is region ${m.customer_region} and should be delivered to ${m.customer_region}.`
          );
        }
      }

      // Cross-region risk: a line item bought beyond local need (excess/for_stock) whose
      // item still has unmet demand at a *different* warehouse. The excess may be intended
      // to (incorrectly) serve that other region — same wrong-warehouse problem as a direct
      // mix, just one hop removed, so it gets flagged the same way.
      const crossRegionNotes: string[] = [];
      for (const li of lineItems) {
        if (li.stock_qty <= 0 || !li.item_id) continue;
        for (const [otherKey, otherQueue] of remainingQueues) {
          const [otherItemId] = otherKey.split('::');
          if (otherItemId !== li.item_id) continue;
          for (const slot of otherQueue) {
            if (slot.remaining <= 0 || slot.entry.location_name === li.location_name) continue;
            noteRegion(li.location_name);
            noteRegion(slot.entry.customer_region || slot.entry.location_name, slot.entry.salesorder_number);
            crossRegionNotes.push(
              `${li.name} (${li.sku}) has ${li.stock_qty} ${li.unit} excess at ${li.location_name}, while ${slot.entry.salesorder_number} ${slot.entry.customer_name} still needs ${Math.min(li.stock_qty, slot.remaining)} ${li.unit} at ${slot.entry.location_name}.`
            );
          }
        }
      }

      if (regionToSOs.size > 1) {
        status = 'REGION_MIX';
        const regions = Array.from(regionToSOs.keys());
        const matchDetail = regions
          .map(r => { const sos = Array.from(regionToSOs.get(r)!); return sos.length ? `${r}: ${sos.join(', ')}` : r; })
          .join(' | ');
        region_mix_warning = { regions, detail: [matchDetail, ...warehouseMismatchNotes, ...crossRegionNotes].filter(Boolean).join(' | ') };
      } else if (lineItems.some(li => li.match_status === 'partial_so')) {
        // This PO only partially covers the SO(s) it's matched to — approving it does not
        // fully clear that demand. The remainder still shows up in uncovered_demand below,
        // but the PO itself must not read as a clean "OK".
        status = 'PARTIAL';
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
      // Zoho already shows this SO as "Ordered" (a PO exists — possibly already
      // approved/issued, so it's no longer in our Pending Approval set) or "Stock Ready"
      // (Admin already confirmed inventory covers it). Either way, don't tell Admin to
      // raise a new PO for it.
      if (slot.entry.excluded_from_demand) continue;
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

// ─── Approval action ─────────────────────────────────────────────────────────
// Re-runs the full computation server-side so approval is always gated on fresh
// data, not whatever the client happened to have on screen, and rejects any PO
// whose coverage isn't clean (PARTIAL / REGION_MIX / NEEDS_REVIEW).

export interface SOStatusUpdate {
  salesorder_id: string;
  salesorder_number: string;
  success: boolean;
}

export interface ApproveResult {
  purchaseorder_id: string;
  purchaseorder_number: string;
  success: boolean;
  error?: string;
  so_status_updates?: SOStatusUpdate[];
}

// ─── PO approval logging — feeds the "Purchase Orders — Stock/Excess Items"
// section of the Daily Brief panel on Home (app/dashboard/page.tsx). Only the
// for_stock/excess_stock line items are recorded, not every line on the PO —
// that's the part the Director actually wants visibility into.
function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
}

function sbUrl(path: string) {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  return `${base.replace(/\/$/, '')}/rest/v1/${path}`;
}

async function logPOApproval(po: ComputedPO, approvedBy: string) {
  const stockItems = po.line_items
    .filter(li => li.match_status === 'for_stock' || li.match_status === 'excess_stock')
    .map(li => ({
      item_name: li.name, sku: li.sku, quantity: li.quantity, stock_qty: li.stock_qty,
      match_status: li.match_status, location_name: li.location_name,
    }));
  try {
    const res = await fetch(sbUrl('po_approval_log'), {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        purchaseorder_id: po.purchaseorder_id,
        purchaseorder_number: po.purchaseorder_number,
        vendor_name: po.vendor_name,
        total: po.total,
        stock_items: stockItems,
        approved_by: approvedBy,
      }),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  } catch (err) {
    // Logging failure must never mask a successful Zoho approval — same
    // soft-fail convention as invoice_auto_send_log's logAutoSendResults().
    console.error('[PO Approval] Logging to Supabase failed:', err);
  }
}

export async function approvePurchaseOrders(purchaseorderIds: string[], approvedBy: Role | 'unknown' = 'unknown'): Promise<ApproveResult[]> {
  const { purchase_orders } = await computeApprovalData();
  const byId = new Map(purchase_orders.map(po => [po.purchaseorder_id, po]));

  const results: ApproveResult[] = [];

  for (const poId of purchaseorderIds) {
    const po = byId.get(poId);
    try {
      if (!po) throw new Error('Purchase Order not found or no longer pending approval.');
      if (po.status === 'REGION_MIX') {
        throw new Error(`Cannot approve: matched Sales Orders span multiple regions (${po.region_mix_warning?.regions.join(', ')}).`);
      }
      if (po.status === 'NEEDS_REVIEW') {
        throw new Error('Cannot approve: one or more line items need manual review (missing item on the PO).');
      }
      if (po.status === 'PARTIAL') {
        throw new Error('Cannot approve: one or more line items only partially cover the matched Sales Order(s) — the remaining quantity needs a separate PO or a quantity fix on this one.');
      }

      const detail = await zohoRequest<{ purchaseorder?: Record<string, unknown> }>(`/purchaseorders/${poId}`);
      if (!detail.purchaseorder) throw new Error('Purchase Order not found in Zoho.');
      if (s(detail.purchaseorder.status) !== 'pending_approval') {
        throw new Error(`Only Pending Approval POs can be approved (current: ${s(detail.purchaseorder.status)})`);
      }

      // Approve = pending_approval -> approved (Zoho's actual approval-workflow endpoint,
      // mirroring /salesorders/{id}/approve). Not /status/open, which jumps straight to
      // Issued and skips the Approved step.
      await zohoRequest(`/purchaseorders/${poId}/approve`, { method: 'POST', body: {} });
      await logPOApproval(po, approvedBy);

      // Mark every SO this PO covers as "Ordered" in Zoho — best-effort, since the PO
      // itself is already approved at this point and a failure here shouldn't undo that.
      // Each update is then re-verified by re-fetching the SO, since Zoho has previously
      // 404'd on this call while still returning 200 further up the chain — a silent
      // catch here isn't enough, Admin needs to see when a covered SO didn't actually flip.
      const matchedSOs = Array.from(new Map(
        po.line_items.flatMap(li => li.matches.map(m => [m.salesorder_id, m.salesorder_number] as const))
      ).entries()).filter(([soId]) => soId);

      const so_status_updates: SOStatusUpdate[] = await Promise.all(matchedSOs.map(async ([soId, soNumber]) => {
        try {
          await zohoRequest(`/salesorders/${soId}/substatus/${SO_SUB_STATUS_ORDERED}`, { method: 'POST', body: {} });
        } catch (e) {
          console.warn(`[PO Approval] Failed to mark SO ${soId} as Ordered:`, e);
          return { salesorder_id: soId, salesorder_number: soNumber, success: false };
        }
        try {
          const check = await zohoRequest<{ salesorder?: Record<string, unknown> }>(`/salesorders/${soId}`);
          const ok = s(check.salesorder?.current_sub_status) === SO_SUB_STATUS_ORDERED;
          if (!ok) console.warn(`[PO Approval] SO ${soId} substatus call returned OK but current_sub_status is still "${s(check.salesorder?.current_sub_status)}"`);
          return { salesorder_id: soId, salesorder_number: soNumber, success: ok };
        } catch (e) {
          console.warn(`[PO Approval] Failed to verify SO ${soId} status after update:`, e);
          return { salesorder_id: soId, salesorder_number: soNumber, success: false };
        }
      }));

      results.push({ purchaseorder_id: poId, purchaseorder_number: po.purchaseorder_number, success: true, so_status_updates });
    } catch (e) {
      results.push({ purchaseorder_id: poId, purchaseorder_number: po?.purchaseorder_number || poId, success: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return results;
}
