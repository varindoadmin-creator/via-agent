import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

type AnyObj = Record<string, unknown>;

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function fetchAllPages(path: string, key: string, maxPages = 12): Promise<AnyObj[]> {
  const rows: AnyObj[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await zohoGet(`${path}${sep}per_page=200&page=${page}`);
    const batch = (data[key] || []) as AnyObj[];
    rows.push(...batch);
    if (batch.length < 200) break;
  }
  return rows;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'this_month') return { from: `${y}-${String(m + 1).padStart(2, '0')}-01`, to: `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}` };
  if (period === 'prev_month') {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    return { from: `${py}-${String(pm + 1).padStart(2, '0')}-01`, to: `${py}-${String(pm + 1).padStart(2, '0')}-${new Date(py, pm + 1, 0).getDate()}` };
  }
  if (period === 'prev_year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function n(v: unknown) { return Number(v) || 0; }
function s(v: unknown) { return String(v || '').trim(); }
function norm(v: unknown) { return s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function pct(a: number, b: number) { return b > 0 ? (a / b) * 100 : 0; }
function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.ceil((b - a) / (1000 * 60 * 60 * 24)));
}
function priorityValue(priority: string) {
  if (priority === 'High') return 3;
  if (priority === 'Medium') return 2;
  if (priority === 'Low') return 1;
  return 0;
}
function isCrateLine(li: AnyObj) {
  const haystack = [li.name, li.item_name, li.description, li.sku].map(s).join(' ').toUpperCase();
  return /WOODEN\s*CRATE|CRATE|PETI|PACKING|KAYU|PALLET/.test(haystack);
}

function buildNextMirpoRecommendation(rows: AnyObj[]) {
  type Rec = { sku: string; name: string; qty: number; reason: string; score: number };
  const byKey = new Map<string, Rec>();

  for (const row of rows) {
    const items = ((row.items || []) as AnyObj[]);
    for (const item of items) {
      const sku = s(item.sku);
      const name = s(item.name);
      const key = norm(sku || name);
      if (!key) continue;
      const sold30 = n(item.sold_30d);
      const soldTotal = n(item.sold_total);
      const remaining = n(item.remaining);
      const sellThrough = n(item.sell_through_30d_pct);
      const cover = item.stock_cover_months === null || item.stock_cover_months === undefined ? 99 : n(item.stock_cover_months);

      let score = sold30 * 4 + soldTotal * 1.5;
      if (sellThrough >= 80) score += 80;
      else if (sellThrough >= 60) score += 45;
      else if (sellThrough >= 35) score += 20;
      if (remaining <= 10) score += 50;
      else if (remaining <= 30) score += 30;
      if (cover <= 1.5) score += 40;
      else if (cover <= 3) score += 20;
      if (remaining > 80 && sellThrough < 30) score -= 80;
      if (score <= 0 && soldTotal <= 0) continue;

      const existing = byKey.get(key);
      const reason = sellThrough >= 80
        ? 'Fast 30D sell-through; keep stocked.'
        : remaining <= 30
          ? 'Low remaining stock; replenish.'
          : sold30 > 0
            ? 'Active sales movement.'
            : 'Historical sales movement.';
      if (existing) {
        existing.score += score;
        if (sold30 > 0 && !existing.reason.includes('Fast')) existing.reason = reason;
      } else {
        byKey.set(key, { sku, name, qty: 0, reason, score });
      }
    }
  }

  let candidates = [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, 12);
  if (candidates.length === 0) {
    return {
      recommended_qty: 600,
      note: 'Next MIRPO must remain 600 sheets. No sales velocity detected yet, so review manually before ordering.',
      items: [] as Rec[],
    };
  }

  const totalScore = candidates.reduce((sum, c) => sum + Math.max(1, c.score), 0);
  candidates = candidates.map(c => ({ ...c, qty: Math.max(10, Math.round(((Math.max(1, c.score) / totalScore) * 600) / 10) * 10) }));

  let totalQty = candidates.reduce((sum, c) => sum + c.qty, 0);
  let guard = 0;
  while (totalQty !== 600 && candidates.length && guard < 200) {
    if (totalQty > 600) {
      const target = [...candidates].reverse().find(c => c.qty > 10) || candidates[candidates.length - 1];
      target.qty -= 10;
      totalQty -= 10;
    } else {
      candidates[0].qty += 10;
      totalQty += 10;
    }
    guard++;
  }

  return {
    recommended_qty: 600,
    note: 'Brand policy requires each MIRPO to total exactly 600 sheets. Allocation is based on fast movement, low remaining stock, sell-through, and stock cover.',
    items: candidates.filter(c => c.qty > 0).map(({ score, ...rest }) => rest),
  };
}

function isMirpo(po: AnyObj, detail?: AnyObj) {
  const haystack = [
    po.reference_number, po.purchaseorder_number, po.notes, po.description,
    detail?.reference_number, detail?.purchaseorder_number, detail?.notes, detail?.description,
  ].map(s).join(' ').toUpperCase();
  return haystack.includes('MIRPO');
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') || 'this_year';
  const { from, to } = getDateRange(period);

  try {
    await getZohoAccessToken();

    const poHeaders = await fetchAllPages(
      `/purchaseorders?date_start=${from}&date_end=${to}&sort_column=date&sort_order=D`,
      'purchaseorders',
      12
    );

    const mirpoDetails: AnyObj[] = [];
    for (let i = 0; i < poHeaders.length; i += 8) {
      const batch = poHeaders.slice(i, i + 8);
      const details = await Promise.all(batch.map(async po => {
        try {
          const detail = await zohoGet(`/purchaseorders/${po.purchaseorder_id}`);
          const full = (detail.purchaseorder || po) as AnyObj;
          return isMirpo(po, full) ? full : null;
        } catch { return isMirpo(po) ? po : null; }
      }));
      mirpoDetails.push(...details.filter(Boolean) as AnyObj[]);
    }

    if (mirpoDetails.length === 0) {
      return NextResponse.json({ success: true, from, to, rows: [], summary: null, message: 'No MIRPO purchase orders found. VIA identifies MIRPO from PO reference containing MIRPO.' });
    }

    const earliestPoDate = mirpoDetails.map(p => s(p.date)).filter(Boolean).sort()[0] || from;
    const invoiceHeaders = await fetchAllPages(
      `/invoices?date_start=${earliestPoDate}&date_end=${todayYmd()}&sort_column=date&sort_order=A`,
      'invoices',
      20
    );

    const invoiceDetails: AnyObj[] = [];
    for (let i = 0; i < invoiceHeaders.length; i += 10) {
      const batch = invoiceHeaders.slice(i, i + 10);
      const details = await Promise.all(batch.map(async inv => {
        try { const d = await zohoGet(`/invoices/${inv.invoice_id}`); return (d.invoice || inv) as AnyObj; }
        catch { return inv; }
      }));
      invoiceDetails.push(...details.filter(Boolean));
    }

    type MirpoLine = {
      item_id: string;
      sku: string;
      name: string;
      qty_purchased: number;
      purchase_rate: number;
      purchase_cost: number;
      sold_30d: number;
      sold_total: number;
      revenue_30d: number;
      revenue_total: number;
      last_sale_date: string;
      remaining?: number;
      sell_through_30d_pct?: number;
      gp_30d?: number;
      gp_margin_30d_pct?: number;
      stock_cover_months?: number | null;
      age_days?: number;
      inventory_value_remaining?: number;
      dead_stock?: boolean;
      slow_moving?: boolean;
      overstock?: boolean;
      reorder_freeze?: boolean;
      clearance_candidate?: boolean;
      clearance_discount_pct?: number;
      inventory_reduction_value?: number;
      reduction_priority?: string;
      reduction_action?: string;
      recommendation?: string;
    };

    type MirpoRow = {
      purchaseorder_id: string;
      purchaseorder_number: string;
      reference_number: string;
      vendor_name: string;
      date: string;
      status: string;
      qty_purchased: number;
      crates: number;
      sheets_per_crate: number;
      sold_30d: number;
      sold_total: number;
      remaining: number;
      sell_through_30d_pct: number;
      purchase_cost: number;
      revenue_30d: number;
      gp_30d: number;
      gp_margin_30d_pct: number;
      roi_30d_pct: number;
      cash_locked_inventory: number;
      potential_inventory_reduction_value: number;
      dead_stock_value: number;
      overstock_value: number;
      inventory_reduction_recommendations: AnyObj[];
      items: MirpoLine[];
    };

    function itemKeyFromLine(li: AnyObj) {
      const itemId = s(li.item_id);
      const sku = s(li.sku);
      const name = s(li.name || li.item_name || li.description);
      return itemId || norm(sku) || norm(name);
    }

    // Build MIRPO batches first, then allocate invoice sales to those batches FIFO by item.
    // This prevents one item's sales from being counted repeatedly across multiple MIRPO POs.
    const rows: MirpoRow[] = mirpoDetails.map(po => {
      const poDate = s(po.date) || from;
      const poLines: MirpoLine[] = ((po.line_items || []) as AnyObj[])
        .filter(li => !isCrateLine(li))
        .map(li => {
          const qtyPurchased = n(li.quantity);
          const purchaseRate = n(li.rate);
          return {
            item_id: s(li.item_id),
            sku: s(li.sku),
            name: s(li.name || li.item_name || li.description),
            qty_purchased: qtyPurchased,
            purchase_rate: purchaseRate,
            purchase_cost: n(li.item_total || li.amount) || qtyPurchased * purchaseRate,
            sold_30d: 0,
            sold_total: 0,
            revenue_30d: 0,
            revenue_total: 0,
            last_sale_date: '',
          };
        })
        .filter(li => li.qty_purchased > 0);

      return {
        purchaseorder_id: s(po.purchaseorder_id),
        purchaseorder_number: s(po.purchaseorder_number),
        reference_number: s(po.reference_number),
        vendor_name: s(po.vendor_name),
        date: poDate,
        status: s(po.status),
        qty_purchased: poLines.reduce((sum, li) => sum + li.qty_purchased, 0) || 600,
        crates: 0,
        sheets_per_crate: 30,
        sold_30d: 0,
        sold_total: 0,
        remaining: 0,
        sell_through_30d_pct: 0,
        purchase_cost: poLines.reduce((sum, li) => sum + li.purchase_cost, 0),
        revenue_30d: 0,
        gp_30d: 0,
        gp_margin_30d_pct: 0,
        roi_30d_pct: 0,
        cash_locked_inventory: 0,
        potential_inventory_reduction_value: 0,
        dead_stock_value: 0,
        overstock_value: 0,
        inventory_reduction_recommendations: [],
        items: poLines,
      };
    });

    const batchesByKey = new Map<string, { row: MirpoRow; line: MirpoLine; poDate: string; remainingToAllocate: number }[]>();
    for (const row of rows) {
      for (const line of row.items) {
        const key = itemKeyFromLine(line as unknown as AnyObj);
        if (!key) continue;
        if (!batchesByKey.has(key)) batchesByKey.set(key, []);
        batchesByKey.get(key)!.push({ row, line, poDate: row.date, remainingToAllocate: line.qty_purchased });
      }
    }
    for (const batches of batchesByKey.values()) {
      batches.sort((a, b) => a.poDate.localeCompare(b.poDate) || a.row.purchaseorder_number.localeCompare(b.row.purchaseorder_number));
    }

    const salesEvents: { key: string; date: string; qty: number; unitRevenue: number }[] = [];
    for (const inv of invoiceDetails) {
      const invDate = s(inv.date);
      if (!invDate) continue;
      const lines = (inv.line_items || []) as AnyObj[];
      for (const il of lines) {
        const key = itemKeyFromLine(il);
        if (!key || !batchesByKey.has(key)) continue;
        const qty = n(il.quantity);
        if (qty <= 0) continue;
        const amount = n(il.item_total || il.amount) || qty * n(il.rate);
        salesEvents.push({ key, date: invDate, qty, unitRevenue: amount / qty });
      }
    }
    salesEvents.sort((a, b) => a.date.localeCompare(b.date));

    for (const sale of salesEvents) {
      let qtyLeft = sale.qty;
      const batches = batchesByKey.get(sale.key) || [];
      for (const batch of batches) {
        if (qtyLeft <= 0) break;
        if (sale.date < batch.poDate) continue;
        if (batch.remainingToAllocate <= 0) continue;

        const allocated = Math.min(qtyLeft, batch.remainingToAllocate);
        const revenue = allocated * sale.unitRevenue;
        batch.remainingToAllocate -= allocated;
        qtyLeft -= allocated;

        batch.line.sold_total += allocated;
        batch.line.revenue_total += revenue;
        if (!batch.line.last_sale_date || sale.date > batch.line.last_sale_date) batch.line.last_sale_date = sale.date;

        if (sale.date <= addDays(batch.poDate, 30)) {
          batch.line.sold_30d += allocated;
          batch.line.revenue_30d += revenue;
        }
      }
    }

    for (const row of rows) {
      for (const li of row.items) {
        const remaining = Math.max(0, li.qty_purchased - li.sold_total);
        const gp30 = li.revenue_30d - li.purchase_rate * li.sold_30d;
        const monthlyVelocity = li.sold_total > 0
          ? li.sold_total / Math.max(1, Math.ceil((new Date(`${todayYmd()}T00:00:00`).getTime() - new Date(`${row.date}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24)) / 30)
          : 0;
        const stockCoverMonths = monthlyVelocity > 0 ? remaining / monthlyVelocity : null;
        const ageDays = daysBetween(row.date, todayYmd());
        const sellThrough30d = pct(li.sold_30d, li.qty_purchased);
        const inventoryValueRemaining = remaining * li.purchase_rate;
        const deadStock = remaining > 0 && li.sold_total === 0 && ageDays >= 60;
        const slowMoving = remaining > 0 && ageDays >= 30 && sellThrough30d < 20;
        const overstock = remaining > 0 && stockCoverMonths !== null && stockCoverMonths > 3;
        const reorderFreeze = remaining > 0 && (deadStock || slowMoving || overstock);
        const clearanceCandidate = remaining > 0 && ageDays >= 60 && sellThrough30d < 25;
        const clearanceDiscountPct = ageDays >= 90 && sellThrough30d < 25 ? 15 : ageDays >= 60 && sellThrough30d < 25 ? 10 : slowMoving ? 5 : 0;
        const inventoryReductionValue = reorderFreeze || clearanceCandidate ? inventoryValueRemaining : 0;
        const reductionPriority = deadStock || (ageDays >= 90 && sellThrough30d < 25) ? 'High' : slowMoving || overstock ? 'Medium' : 'Low';

        let recommendation = 'Monitor';
        let reductionAction = 'Monitor sales velocity before next MIRPO.';
        if (deadStock) {
          recommendation = 'Dead stock — stop reorder and clear inventory';
          reductionAction = `Clear with ${clearanceDiscountPct || 10}% discount, bundle with fast movers, or push to project customers.`;
        } else if (clearanceCandidate) {
          recommendation = 'Clearance candidate';
          reductionAction = `Offer ${clearanceDiscountPct}% discount or bundle to reduce aging stock.`;
        } else if (slowMoving) {
          recommendation = 'Slow mover — reduce exposure';
          reductionAction = 'Freeze reorder, ask sales team to push, and consider 5% tactical discount.';
        } else if (remaining <= monthlyVelocity * 0.75) {
          recommendation = 'Reorder soon';
          reductionAction = 'Keep selling; do not discount unless needed.';
        } else if (overstock) {
          recommendation = 'Overstock risk';
          reductionAction = 'Freeze reorder until stock cover falls below 3 months.';
        }

        Object.assign(li, {
          sold_30d: Math.min(li.sold_30d, li.qty_purchased),
          sold_total: Math.min(li.sold_total, li.qty_purchased),
          remaining,
          sell_through_30d_pct: Math.min(100, sellThrough30d),
          gp_30d: gp30,
          gp_margin_30d_pct: pct(gp30, li.revenue_30d),
          stock_cover_months: stockCoverMonths,
          age_days: ageDays,
          inventory_value_remaining: inventoryValueRemaining,
          dead_stock: deadStock,
          slow_moving: slowMoving,
          overstock,
          reorder_freeze: reorderFreeze,
          clearance_candidate: clearanceCandidate,
          clearance_discount_pct: clearanceDiscountPct,
          inventory_reduction_value: inventoryReductionValue,
          reduction_priority: reductionPriority,
          reduction_action: reductionAction,
          recommendation,
        });
      }

      row.qty_purchased = row.items.reduce((sum, li) => sum + li.qty_purchased, 0) || 600;
      row.crates = row.qty_purchased > 0 ? Math.round((row.qty_purchased / 30) * 100) / 100 : 0;
      row.sold_30d = Math.min(row.qty_purchased, row.items.reduce((sum, li) => sum + li.sold_30d, 0));
      row.sold_total = Math.min(row.qty_purchased, row.items.reduce((sum, li) => sum + li.sold_total, 0));
      row.remaining = Math.max(0, row.items.reduce((sum, li) => sum + (li.remaining || 0), 0));
      row.purchase_cost = row.items.reduce((sum, li) => sum + li.purchase_cost, 0);
      row.revenue_30d = row.items.reduce((sum, li) => sum + li.revenue_30d, 0);
      row.gp_30d = row.items.reduce((sum, li) => sum + (li.gp_30d || 0), 0);
      row.sell_through_30d_pct = Math.min(100, pct(row.sold_30d, row.qty_purchased));
      row.gp_margin_30d_pct = pct(row.gp_30d, row.revenue_30d);
      row.roi_30d_pct = pct(row.gp_30d, row.purchase_cost);
      row.cash_locked_inventory = row.items.reduce((sum, li) => sum + (li.inventory_value_remaining || 0), 0);
      row.potential_inventory_reduction_value = row.items.reduce((sum, li) => sum + (li.inventory_reduction_value || 0), 0);
      row.dead_stock_value = row.items.filter(li => li.dead_stock).reduce((sum, li) => sum + (li.inventory_value_remaining || 0), 0);
      row.overstock_value = row.items.filter(li => li.overstock || li.slow_moving).reduce((sum, li) => sum + (li.inventory_value_remaining || 0), 0);
      row.inventory_reduction_recommendations = row.items
        .filter(li => (li.inventory_reduction_value || 0) > 0)
        .sort((a, b) => priorityValue(s(b.reduction_priority)) - priorityValue(s(a.reduction_priority)) || (b.inventory_reduction_value || 0) - (a.inventory_reduction_value || 0))
        .slice(0, 12) as unknown as AnyObj[];
      row.items = row.items.sort((a, b) => b.sold_30d - a.sold_30d);
    }

    const summary = {
      mirpo_count: rows.length,
      qty_purchased: rows.reduce((s, r) => s + r.qty_purchased, 0),
      crates: rows.reduce((s, r) => s + r.crates, 0),
      sold_30d: rows.reduce((s, r) => s + r.sold_30d, 0),
      remaining: rows.reduce((s, r) => s + r.remaining, 0),
      purchase_cost: rows.reduce((s, r) => s + r.purchase_cost, 0),
      revenue_30d: rows.reduce((s, r) => s + r.revenue_30d, 0),
      gp_30d: rows.reduce((s, r) => s + r.gp_30d, 0),
      cash_locked_inventory: rows.reduce((s, r) => s + r.cash_locked_inventory, 0),
      potential_inventory_reduction_value: rows.reduce((s, r) => s + r.potential_inventory_reduction_value, 0),
      dead_stock_value: rows.reduce((s, r) => s + r.dead_stock_value, 0),
      overstock_value: rows.reduce((s, r) => s + r.overstock_value, 0),
    };
    Object.assign(summary, {
      sell_through_30d_pct: pct(summary.sold_30d, summary.qty_purchased),
      roi_30d_pct: pct(summary.gp_30d, summary.purchase_cost),
      gp_margin_30d_pct: pct(summary.gp_30d, summary.revenue_30d),
    });
    Object.assign(summary, { next_mirpo_recommendation: buildNextMirpoRecommendation(rows as AnyObj[]) });

    const inventory_reduction_recommendations = rows
      .flatMap(r => (r.inventory_reduction_recommendations || []).map((i: AnyObj) => ({ ...i, purchaseorder_number: r.purchaseorder_number, po_date: r.date })))
      .sort((a, b) => priorityValue(s(b.reduction_priority)) - priorityValue(s(a.reduction_priority)) || n(b.inventory_reduction_value) - n(a.inventory_reduction_value))
      .slice(0, 20);

    return NextResponse.json({ success: true, from, to, rows, summary, inventory_reduction_recommendations });
  } catch (err) {
    console.error('[MIRPO Analysis]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
