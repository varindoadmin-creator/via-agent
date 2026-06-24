import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

type AnyObj = Record<string, unknown>;

// ─── Configurable thresholds — edit here to change behaviour globally ─────────
/** Regex to identify wooden crate / packing lines to exclude from MIRPO sheet count. */
const CRATE_PATTERN = /WOODEN\s*CRATE|CRATE|PETI|PACKING|KAYU|PALLET/i;

/** 30D sell-through % thresholds for stock_status classification. */
const ST_THRESHOLDS = {
  FAST_MOVING:  80,   // >= 80 % → Fast Moving
  HEALTHY:      50,   // >= 50 % → Healthy
  SLOW_MOVING:  20,   // >= 20 % → Slow Moving
  // < 20 %           → Dead Stock Risk
};

// ─── Zoho helpers ─────────────────────────────────────────────────────────────
async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base  = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep   = path.includes('?') ? '&' : '?';
  const url   = `${base}${path}${sep}organization_id=${orgId}`;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res  = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: ctrl.signal });
    const body = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    return body;
  } finally { clearTimeout(timer); }
}

async function fetchAllPages(path: string, key: string, maxPages = 12): Promise<AnyObj[]> {
  const rows: AnyObj[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep  = path.includes('?') ? '&' : '?';
    const data = await zohoGet(`${path}${sep}per_page=200&page=${page}`);
    const batch = (data[key] || []) as AnyObj[];
    rows.push(...batch);
    if (batch.length < 200) break;
  }
  return rows;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayYmd() { return new Date().toISOString().slice(0, 10); }

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** saleDate is within 30 days of poDate (inclusive). Assumes saleDate >= poDate already. */
function within30d(saleDate: string, poDate: string): boolean {
  return saleDate <= addDays(poDate, 30);
}

/** saleDate is in the same calendar month and year as poDate. */
function sameCalMonth(saleDate: string, poDate: string): boolean {
  return saleDate.slice(0, 7) === poDate.slice(0, 7);
}

/** saleDate is in the same calendar year as poDate. */
function sameCalYear(saleDate: string, poDate: string): boolean {
  return saleDate.slice(0, 4) === poDate.slice(0, 4);
}

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'this_month') {
    const mm = String(m + 1).padStart(2, '0');
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${new Date(y, m + 1, 0).getDate()}` };
  }
  if (period === 'prev_month') {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    const mm = String(pm + 1).padStart(2, '0');
    return { from: `${py}-${mm}-01`, to: `${py}-${mm}-${new Date(py, pm + 1, 0).getDate()}` };
  }
  if (period === 'prev_year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

// ─── Field helpers ─────────────────────────────────────────────────────────────
function n(v: unknown)  { return Number(v) || 0; }
function s(v: unknown)  { return String(v || '').trim(); }
function norm(v: unknown) { return s(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.ceil((b - a) / (1000 * 60 * 60 * 24)));
}

/** Percentage, always capped at 100. Returns 0 when denominator is 0. */
function pct(num: number, den: number): number {
  return den > 0 ? Math.min(100, (num / den) * 100) : 0;
}

/** Classify stock status from 30D sell-through and remaining qty. */
function classifyStock(st30: number, remaining: number): string {
  if (remaining === 0)                    return 'Sold Out';
  if (st30 >= ST_THRESHOLDS.FAST_MOVING)  return 'Fast Moving';
  if (st30 >= ST_THRESHOLDS.HEALTHY)      return 'Healthy';
  if (st30 >= ST_THRESHOLDS.SLOW_MOVING)  return 'Slow Moving';
  return 'Dead Stock Risk';
}

function priorityValue(p: string) {
  if (p === 'High')   return 3;
  if (p === 'Medium') return 2;
  if (p === 'Low')    return 1;
  return 0;
}

/** True when the line item is a wooden crate / packing — exclude from sheet counts. */
function isCrateLine(li: AnyObj): boolean {
  const hay = [li.name, li.item_name, li.description, li.sku].map(s).join(' ');
  return CRATE_PATTERN.test(hay);
}

function isMirpo(po: AnyObj, detail?: AnyObj): boolean {
  const hay = [
    po.reference_number, po.purchaseorder_number, po.notes, po.description,
    detail?.reference_number, detail?.purchaseorder_number, detail?.notes, detail?.description,
  ].map(s).join(' ').toUpperCase();
  return hay.includes('MIRPO');
}

function itemKeyFromLine(li: AnyObj): string {
  const itemId = s(li.item_id);
  const sku    = s(li.sku);
  const name   = s(li.name || li.item_name || li.description);
  return itemId || norm(sku) || norm(name);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MirpoLine = {
  item_id: string;
  sku: string;
  name: string;
  qty_purchased: number;
  purchase_rate: number;
  purchase_cost: number;
  // ── FIFO-allocated sold quantities (capped by MIRPO qty via remainingToAllocate)
  sold_30d: number;
  sold_same_month: number;
  sold_same_year: number;
  sold_total: number;         // all time from PO date → today (for stock-cover maths)
  // ── Raw sales quantities for the same SKU in each window (NOT capped — for context)
  raw_sales_30d: number;
  raw_sales_same_month: number;
  raw_sales_same_year: number;
  // ── Revenue in each window
  revenue_30d: number;
  revenue_same_month: number;
  revenue_same_year: number;
  revenue_total: number;
  // ── Remaining MIRPO qty after each window
  remaining_30d: number;
  remaining_same_month: number;
  remaining_same_year: number;
  remaining: number;          // remaining after all-time sold_total
  // ── Sell-through % per window (always ≤ 100)
  sell_through_30d_pct: number;
  sell_through_same_month_pct: number;
  sell_through_same_year_pct: number;
  // ── Financial / inventory metrics
  gp_30d: number;
  gp_margin_30d_pct: number;
  stock_cover_months: number | null;
  age_days: number;
  inventory_value_remaining: number;
  last_sale_date: string;
  // ── Stock status and recommendations
  stock_status: string;
  dead_stock: boolean;
  slow_moving: boolean;
  overstock: boolean;
  reorder_freeze: boolean;
  clearance_candidate: boolean;
  clearance_discount_pct: number;
  inventory_reduction_value: number;
  reduction_priority: string;
  reduction_action: string;
  recommendation: string;
};

type MirpoRow = {
  purchaseorder_id: string;
  purchaseorder_number: string;
  reference_number: string;
  vendor_name: string;
  date: string;
  month: string;    // YYYY-MM
  year: string;     // YYYY
  status: string;
  qty_purchased: number;
  crates: number;
  sheets_per_crate: number;
  // ── Aggregated from item lines
  sold_30d: number;
  sold_same_month: number;
  sold_same_year: number;
  remaining_30d: number;
  remaining_same_month: number;
  remaining_same_year: number;
  remaining: number;
  sell_through_30d_pct: number;
  sell_through_same_month_pct: number;
  sell_through_same_year_pct: number;
  purchase_cost: number;
  revenue_30d: number;
  revenue_same_month: number;
  revenue_same_year: number;
  gp_30d: number;
  gp_margin_30d_pct: number;
  roi_30d_pct: number;
  cash_locked_inventory: number;
  potential_inventory_reduction_value: number;
  dead_stock_value: number;
  overstock_value: number;
  dead_stock_sheets: number;
  slow_moving_sheets: number;
  inventory_reduction_recommendations: AnyObj[];
  items: MirpoLine[];
};

// ─── Next MIRPO recommendation builder ────────────────────────────────────────
function buildNextMirpoRecommendation(rows: AnyObj[]) {
  type Rec = { sku: string; name: string; qty: number; reason: string; score: number };
  const byKey = new Map<string, Rec>();

  for (const row of rows) {
    for (const item of ((row.items || []) as AnyObj[])) {
      const sku  = s(item.sku);
      const name = s(item.name);
      const key  = norm(sku || name);
      if (!key) continue;

      const sold30       = n(item.sold_30d);
      const soldTotal    = n(item.sold_total);
      const remaining    = n(item.remaining);
      const sellThrough  = n(item.sell_through_30d_pct);
      const cover        = item.stock_cover_months == null ? 99 : n(item.stock_cover_months);

      let score = sold30 * 4 + soldTotal * 1.5;
      if (sellThrough >= 80)  score += 80;
      else if (sellThrough >= 60) score += 45;
      else if (sellThrough >= 35) score += 20;
      if (remaining <= 10)    score += 50;
      else if (remaining <= 30) score += 30;
      if (cover <= 1.5)       score += 40;
      else if (cover <= 3)    score += 20;
      if (remaining > 80 && sellThrough < 30) score -= 80;
      if (score <= 0 && soldTotal <= 0) continue;

      const reason =
        sellThrough >= 80  ? 'Fast 30D sell-through; keep stocked.' :
        remaining   <= 30  ? 'Low remaining stock; replenish.' :
        sold30      > 0    ? 'Active sales movement.' :
                             'Historical sales movement.';

      const existing = byKey.get(key);
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
      note: 'Next MIRPO must remain 600 sheets. No sales velocity detected yet — review manually before ordering.',
      items: [] as Rec[],
    };
  }

  const totalScore = candidates.reduce((sum, c) => sum + Math.max(1, c.score), 0);
  candidates = candidates.map(c => ({
    ...c,
    qty: Math.max(10, Math.round(((Math.max(1, c.score) / totalScore) * 600) / 10) * 10),
  }));

  let totalQty = candidates.reduce((sum, c) => sum + c.qty, 0);
  let guard = 0;
  while (totalQty !== 600 && candidates.length && guard < 200) {
    if (totalQty > 600) {
      const t = [...candidates].reverse().find(c => c.qty > 10) || candidates[candidates.length - 1];
      t.qty -= 10; totalQty -= 10;
    } else {
      candidates[0].qty += 10; totalQty += 10;
    }
    guard++;
  }

  return {
    recommended_qty: 600,
    note: 'Brand policy requires each MIRPO to total exactly 600 sheets. Allocation is based on fast movement, low remaining stock, sell-through, and stock cover.',
    items: candidates.filter(c => c.qty > 0).map(({ score: _s, ...rest }) => rest),
  };
}

// ─── Aggregation helpers ───────────────────────────────────────────────────────
function groupByMonth(rows: MirpoRow[]) {
  const map = new Map<string, {
    month: string; mirpo_count: number;
    qty_purchased: number;
    sold_30d: number; sold_same_month: number;
    remaining_30d: number;
    sell_through_30d_pct: number; sell_through_same_month_pct: number;
    dead_stock_sheets: number; slow_moving_sheets: number;
  }>();

  for (const row of rows) {
    const key = row.month;
    if (!map.has(key)) {
      map.set(key, {
        month: key, mirpo_count: 0,
        qty_purchased: 0,
        sold_30d: 0, sold_same_month: 0,
        remaining_30d: 0,
        sell_through_30d_pct: 0, sell_through_same_month_pct: 0,
        dead_stock_sheets: 0, slow_moving_sheets: 0,
      });
    }
    const g = map.get(key)!;
    g.mirpo_count      += 1;
    g.qty_purchased    += row.qty_purchased;
    g.sold_30d         += row.sold_30d;
    g.sold_same_month  += row.sold_same_month;
    g.remaining_30d    += row.remaining_30d;
    g.dead_stock_sheets  += row.dead_stock_sheets;
    g.slow_moving_sheets += row.slow_moving_sheets;
  }

  for (const g of map.values()) {
    g.sell_through_30d_pct        = pct(g.sold_30d, g.qty_purchased);
    g.sell_through_same_month_pct = pct(g.sold_same_month, g.qty_purchased);
  }

  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function groupByYear(rows: MirpoRow[]) {
  const map = new Map<string, {
    year: string; mirpo_count: number;
    qty_purchased: number;
    sold_30d: number; sold_same_year: number;
    remaining_30d: number; remaining_same_year: number;
    sell_through_30d_pct: number; sell_through_same_year_pct: number;
    dead_stock_sheets: number; slow_moving_sheets: number;
  }>();

  for (const row of rows) {
    const key = row.year;
    if (!map.has(key)) {
      map.set(key, {
        year: key, mirpo_count: 0,
        qty_purchased: 0,
        sold_30d: 0, sold_same_year: 0,
        remaining_30d: 0, remaining_same_year: 0,
        sell_through_30d_pct: 0, sell_through_same_year_pct: 0,
        dead_stock_sheets: 0, slow_moving_sheets: 0,
      });
    }
    const g = map.get(key)!;
    g.mirpo_count        += 1;
    g.qty_purchased      += row.qty_purchased;
    g.sold_30d           += row.sold_30d;
    g.sold_same_year     += row.sold_same_year;
    g.remaining_30d      += row.remaining_30d;
    g.remaining_same_year += row.remaining_same_year;
    g.dead_stock_sheets  += row.dead_stock_sheets;
    g.slow_moving_sheets += row.slow_moving_sheets;
  }

  for (const g of map.values()) {
    g.sell_through_30d_pct       = pct(g.sold_30d, g.qty_purchased);
    g.sell_through_same_year_pct = pct(g.sold_same_year, g.qty_purchased);
  }

  return [...map.values()].sort((a, b) => a.year.localeCompare(b.year));
}

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const period     = req.nextUrl.searchParams.get('period') || 'this_year';
  const fromParam  = req.nextUrl.searchParams.get('from');
  const toParam    = req.nextUrl.searchParams.get('to');
  // Allow caller to pass explicit from/to dates (custom range), overriding the period preset.
  const { from, to } = (fromParam && toParam)
    ? { from: fromParam, to: toParam }
    : getDateRange(period);

  try {
    await getZohoAccessToken();

    // 1. Fetch PO headers for the selected period.
    const poHeaders = await fetchAllPages(
      `/purchaseorders?date_start=${from}&date_end=${to}&sort_column=date&sort_order=D`,
      'purchaseorders', 12,
    );

    // 2. Pre-filter headers by MIRPO marker to avoid unnecessary detail calls.
    const mirpoCandidates = poHeaders.filter(po => isMirpo(po));

    // 3. Fetch full PO detail (for line items) in parallel batches of 8.
    const mirpoDetails: AnyObj[] = [];
    for (let i = 0; i < mirpoCandidates.length; i += 8) {
      const batch = mirpoCandidates.slice(i, i + 8);
      const details = await Promise.all(batch.map(async po => {
        try {
          const d = await zohoGet(`/purchaseorders/${po.purchaseorder_id}`);
          return (d.purchaseorder || po) as AnyObj;
        } catch { return po; }
      }));
      mirpoDetails.push(...details.filter(Boolean) as AnyObj[]);
    }

    if (mirpoDetails.length === 0) {
      return NextResponse.json({
        success: true, from, to, rows: [], monthly: [], yearly: [], summary: null,
        message: 'No MIRPO purchase orders found. VIA identifies MIRPO from PO reference or number containing "MIRPO".',
      });
    }

    // 4. Collect invoice IDs relevant to each MIRPO window (PO date → today).
    //    Run concurrently — one Zoho invoice search per MIRPO window.
    const windowFetches = await Promise.all(mirpoDetails.map(async po => {
      const poDate = s(po.date) || from;
      try {
        const headers = await fetchAllPages(
          `/invoices?date_start=${poDate}&date_end=${todayYmd()}&sort_column=date&sort_order=A`,
          'invoices', 5,   // 5 pages × 200 = up to 1000 invoices per window
        );
        return headers.map(h => s(h.invoice_id)).filter(Boolean);
      } catch { return [] as string[]; }
    }));

    const relevantInvoiceIds = new Set<string>();
    for (const ids of windowFetches) for (const id of ids) relevantInvoiceIds.add(id);

    // 5. Fetch invoice details (line items) in concurrent batches of 25, cap 400 total.
    const invoiceDetails: AnyObj[] = [];
    const invoiceIdArray = [...relevantInvoiceIds].slice(0, 400);
    for (let i = 0; i < invoiceIdArray.length; i += 25) {
      const batch = invoiceIdArray.slice(i, i + 25);
      const details = await Promise.all(batch.map(async id => {
        try { const d = await zohoGet(`/invoices/${id}`); return (d.invoice || null) as AnyObj | null; }
        catch { return null; }
      }));
      invoiceDetails.push(...details.filter(Boolean) as AnyObj[]);
    }

    // 6. Build MIRPO rows from PO detail, excluding crate lines.
    const rows: MirpoRow[] = mirpoDetails.map(po => {
      const poDate = s(po.date) || from;
      const poLines: MirpoLine[] = ((po.line_items || []) as AnyObj[])
        .filter(li => !isCrateLine(li))
        .map(li => {
          const qtyPurchased  = n(li.quantity);
          const purchaseRate  = n(li.rate);
          return {
            item_id: s(li.item_id),
            sku:     s(li.sku),
            name:    s(li.name || li.item_name || li.description),
            qty_purchased: qtyPurchased,
            purchase_rate: purchaseRate,
            purchase_cost: n(li.item_total || li.amount) || qtyPurchased * purchaseRate,
            // All accumulation fields start at zero; FIFO loop fills them.
            sold_30d: 0, sold_same_month: 0, sold_same_year: 0, sold_total: 0,
            raw_sales_30d: 0, raw_sales_same_month: 0, raw_sales_same_year: 0,
            revenue_30d: 0, revenue_same_month: 0, revenue_same_year: 0, revenue_total: 0,
            remaining_30d: qtyPurchased, remaining_same_month: qtyPurchased,
            remaining_same_year: qtyPurchased, remaining: qtyPurchased,
            sell_through_30d_pct: 0, sell_through_same_month_pct: 0, sell_through_same_year_pct: 0,
            gp_30d: 0, gp_margin_30d_pct: 0, stock_cover_months: null,
            age_days: 0, inventory_value_remaining: 0, last_sale_date: '',
            stock_status: 'Dead Stock Risk',
            dead_stock: false, slow_moving: false, overstock: false,
            reorder_freeze: false, clearance_candidate: false,
            clearance_discount_pct: 0, inventory_reduction_value: 0,
            reduction_priority: 'Low', reduction_action: '', recommendation: 'Monitor',
          } satisfies MirpoLine;
        })
        .filter(li => li.qty_purchased > 0);

      return {
        purchaseorder_id:     s(po.purchaseorder_id),
        purchaseorder_number: s(po.purchaseorder_number),
        reference_number:     s(po.reference_number),
        vendor_name:          s(po.vendor_name),
        date:   poDate,
        month:  poDate.slice(0, 7),
        year:   poDate.slice(0, 4),
        status: s(po.status),
        qty_purchased: poLines.reduce((sum, li) => sum + li.qty_purchased, 0) || 600,
        crates: 0, sheets_per_crate: 30,
        sold_30d: 0, sold_same_month: 0, sold_same_year: 0,
        remaining_30d: 0, remaining_same_month: 0, remaining_same_year: 0, remaining: 0,
        sell_through_30d_pct: 0, sell_through_same_month_pct: 0, sell_through_same_year_pct: 0,
        purchase_cost: poLines.reduce((sum, li) => sum + li.purchase_cost, 0),
        revenue_30d: 0, revenue_same_month: 0, revenue_same_year: 0,
        gp_30d: 0, gp_margin_30d_pct: 0, roi_30d_pct: 0,
        cash_locked_inventory: 0, potential_inventory_reduction_value: 0,
        dead_stock_value: 0, overstock_value: 0,
        dead_stock_sheets: 0, slow_moving_sheets: 0,
        inventory_reduction_recommendations: [],
        items: poLines,
      } satisfies MirpoRow;
    });

    // 7. Build FIFO allocation structure:
    //    batchesByKey maps itemKey → sorted array of (MIRPO row, line, poDate, remainingToAllocate).
    //    Sorting by poDate ensures FIFO — earlier MIRPO is filled first.
    //    remainingToAllocate tracks how much MIRPO quantity is still unallocated.
    const batchesByKey = new Map<string, {
      row: MirpoRow; line: MirpoLine; poDate: string; remainingToAllocate: number;
    }[]>();

    for (const row of rows) {
      for (const line of row.items) {
        const key = itemKeyFromLine(line as unknown as AnyObj);
        if (!key) continue;
        if (!batchesByKey.has(key)) batchesByKey.set(key, []);
        batchesByKey.get(key)!.push({
          row, line, poDate: row.date, remainingToAllocate: line.qty_purchased,
        });
      }
    }
    // Sort each SKU's batches by PO date ascending so FIFO fills the earliest MIRPO first.
    for (const batches of batchesByKey.values()) {
      batches.sort((a, b) =>
        a.poDate.localeCompare(b.poDate) ||
        a.row.purchaseorder_number.localeCompare(b.row.purchaseorder_number),
      );
    }

    // 8. Build raw-sales accumulator (no FIFO cap — purely for reference/context).
    //    rawByKeyAndPo: itemKey → poDate → { qty_30d, qty_same_month, qty_same_year }
    //    This lets us show "raw sales qty within 30D" beside the capped MIRPO-allocated qty.
    const rawByKeyAndPo = new Map<string, Map<string, { qty_30d: number; qty_same_month: number; qty_same_year: number }>>();
    for (const row of rows) {
      for (const line of row.items) {
        const key = itemKeyFromLine(line as unknown as AnyObj);
        if (!key) continue;
        if (!rawByKeyAndPo.has(key)) rawByKeyAndPo.set(key, new Map());
        rawByKeyAndPo.get(key)!.set(row.date, { qty_30d: 0, qty_same_month: 0, qty_same_year: 0 });
      }
    }

    // 9. Collect and sort all invoice line items as sales events.
    const salesEvents: { key: string; date: string; qty: number; unitRevenue: number }[] = [];
    for (const inv of invoiceDetails) {
      const invDate = s(inv.date);
      if (!invDate) continue;
      for (const il of ((inv.line_items || []) as AnyObj[])) {
        const key = itemKeyFromLine(il);
        if (!key || !batchesByKey.has(key)) continue;
        const qty = n(il.quantity);
        if (qty <= 0) continue;
        const amount = n(il.item_total || il.amount) || qty * n(il.rate);
        salesEvents.push({ key, date: invDate, qty, unitRevenue: amount / qty });
      }
    }
    salesEvents.sort((a, b) => a.date.localeCompare(b.date));

    // 10. FIFO allocation — iterate sales oldest-first.
    //     For each sale, attempt to fill the earliest eligible MIRPO batch for that SKU.
    //     A sale unit allocated to MIRPO batch A is NOT counted again for MIRPO batch B.
    for (const sale of salesEvents) {
      // ── Accumulate raw sales into each MIRPO window for this SKU (no FIFO cap).
      const rawPoMap = rawByKeyAndPo.get(sale.key);
      if (rawPoMap) {
        for (const [poDate, raw] of rawPoMap) {
          if (sale.date < poDate) continue;   // sale before this MIRPO's PO date — skip
          if (within30d(sale.date, poDate))          raw.qty_30d        += sale.qty;
          if (sameCalMonth(sale.date, poDate))       raw.qty_same_month += sale.qty;
          if (sameCalYear(sale.date, poDate))        raw.qty_same_year  += sale.qty;
        }
      }

      // ── FIFO capped allocation.
      let qtyLeft = sale.qty;
      for (const batch of batchesByKey.get(sale.key) || []) {
        if (qtyLeft <= 0) break;
        // Do not allocate a sale that happened before this MIRPO's PO date.
        if (sale.date < batch.poDate) continue;
        // Skip batches that are already fully consumed.
        if (batch.remainingToAllocate <= 0) continue;

        // Allocate as much as possible to this batch (limited by remaining MIRPO qty).
        const allocated = Math.min(qtyLeft, batch.remainingToAllocate);
        const revenue   = allocated * sale.unitRevenue;
        batch.remainingToAllocate -= allocated;
        qtyLeft                   -= allocated;

        batch.line.sold_total    += allocated;
        batch.line.revenue_total += revenue;
        if (!batch.line.last_sale_date || sale.date > batch.line.last_sale_date) {
          batch.line.last_sale_date = sale.date;
        }

        // Bucket into each reporting window for this MIRPO's poDate.
        if (within30d(sale.date, batch.poDate)) {
          batch.line.sold_30d    += allocated;
          batch.line.revenue_30d += revenue;
        }
        if (sameCalMonth(sale.date, batch.poDate)) {
          batch.line.sold_same_month    += allocated;
          batch.line.revenue_same_month += revenue;
        }
        if (sameCalYear(sale.date, batch.poDate)) {
          batch.line.sold_same_year    += allocated;
          batch.line.revenue_same_year += revenue;
        }
      }
    }

    // 11. Copy raw sales back into each line item.
    for (const row of rows) {
      for (const line of row.items) {
        const key    = itemKeyFromLine(line as unknown as AnyObj);
        const raw    = rawByKeyAndPo.get(key)?.get(row.date);
        if (raw) {
          line.raw_sales_30d       = raw.qty_30d;
          line.raw_sales_same_month = raw.qty_same_month;
          line.raw_sales_same_year  = raw.qty_same_year;
        }
      }
    }

    // 12. Finalize per-line metrics, then roll up to PO level.
    const today = todayYmd();
    for (const row of rows) {
      for (const li of row.items) {
        // Cap all sold quantities at MIRPO item qty (belt-and-suspenders on top of FIFO cap).
        li.sold_30d       = Math.min(li.sold_30d,       li.qty_purchased);
        li.sold_same_month = Math.min(li.sold_same_month, li.qty_purchased);
        li.sold_same_year  = Math.min(li.sold_same_year,  li.qty_purchased);
        li.sold_total      = Math.min(li.sold_total,      li.qty_purchased);

        // Remaining per window.
        li.remaining_30d        = li.qty_purchased - li.sold_30d;
        li.remaining_same_month = li.qty_purchased - li.sold_same_month;
        li.remaining_same_year  = li.qty_purchased - li.sold_same_year;
        li.remaining            = li.qty_purchased - li.sold_total;

        // Sell-through % per window — always capped at 100.
        li.sell_through_30d_pct        = pct(li.sold_30d,       li.qty_purchased);
        li.sell_through_same_month_pct = pct(li.sold_same_month, li.qty_purchased);
        li.sell_through_same_year_pct  = pct(li.sold_same_year,  li.qty_purchased);

        // Financial metrics.
        const gp30 = li.revenue_30d - li.purchase_rate * li.sold_30d;
        li.gp_30d            = gp30;
        li.gp_margin_30d_pct = pct(gp30, li.revenue_30d);

        // Stock cover (in months) based on all-time sold velocity from PO date.
        const ageDays = daysBetween(row.date, today);
        const monthlyVelocity =
          li.sold_total > 0 && ageDays > 0
            ? li.sold_total / Math.max(1, ageDays / 30)
            : 0;
        li.stock_cover_months     = monthlyVelocity > 0 ? li.remaining / monthlyVelocity : null;
        li.age_days               = ageDays;
        li.inventory_value_remaining = li.remaining * li.purchase_rate;

        // Stock status classification (thresholds in ST_THRESHOLDS above).
        li.stock_status = classifyStock(li.sell_through_30d_pct, li.remaining);

        // Legacy boolean flags (kept for backward compatibility with recommendation engine).
        li.dead_stock          = li.remaining > 0 && li.sold_total === 0 && ageDays >= 60;
        li.slow_moving         = li.remaining > 0 && ageDays >= 30 && li.sell_through_30d_pct < ST_THRESHOLDS.SLOW_MOVING;
        li.overstock           = li.remaining > 0 && li.stock_cover_months !== null && li.stock_cover_months > 3;
        li.reorder_freeze      = li.remaining > 0 && (li.dead_stock || li.slow_moving || li.overstock);
        li.clearance_candidate = li.remaining > 0 && ageDays >= 60 && li.sell_through_30d_pct < 25;
        li.clearance_discount_pct =
          ageDays >= 90 && li.sell_through_30d_pct < 25 ? 15 :
          ageDays >= 60 && li.sell_through_30d_pct < 25 ? 10 :
          li.slow_moving ? 5 : 0;
        li.inventory_reduction_value = (li.reorder_freeze || li.clearance_candidate) ? li.inventory_value_remaining : 0;

        const hp = li.dead_stock || (ageDays >= 90 && li.sell_through_30d_pct < 25);
        li.reduction_priority = hp ? 'High' : (li.slow_moving || li.overstock) ? 'Medium' : 'Low';

        if (li.dead_stock) {
          li.recommendation   = 'Dead stock — stop reorder and clear inventory';
          li.reduction_action = `Clear with ${li.clearance_discount_pct || 10}% discount, bundle with fast movers, or push to project customers.`;
        } else if (li.clearance_candidate) {
          li.recommendation   = 'Clearance candidate';
          li.reduction_action = `Offer ${li.clearance_discount_pct}% discount or bundle to reduce aging stock.`;
        } else if (li.slow_moving) {
          li.recommendation   = 'Slow mover — reduce exposure';
          li.reduction_action = 'Freeze reorder, ask sales team to push, and consider 5% tactical discount.';
        } else if (li.remaining <= (monthlyVelocity > 0 ? monthlyVelocity * 0.75 : 0)) {
          li.recommendation   = 'Reorder soon';
          li.reduction_action = 'Keep selling; do not discount unless needed.';
        } else if (li.overstock) {
          li.recommendation   = 'Overstock risk';
          li.reduction_action = 'Freeze reorder until stock cover falls below 3 months.';
        } else {
          li.recommendation   = 'Monitor';
          li.reduction_action = 'Monitor sales velocity before next MIRPO.';
        }
      }

      // ── Roll up PO-level totals from items.
      row.qty_purchased     = row.items.reduce((s, li) => s + li.qty_purchased, 0) || 600;
      row.crates            = Math.round((row.qty_purchased / 30) * 100) / 100;
      row.sold_30d          = row.items.reduce((s, li) => s + li.sold_30d, 0);
      row.sold_same_month   = row.items.reduce((s, li) => s + li.sold_same_month, 0);
      row.sold_same_year    = row.items.reduce((s, li) => s + li.sold_same_year, 0);
      row.remaining_30d     = row.items.reduce((s, li) => s + li.remaining_30d, 0);
      row.remaining_same_month = row.items.reduce((s, li) => s + li.remaining_same_month, 0);
      row.remaining_same_year  = row.items.reduce((s, li) => s + li.remaining_same_year, 0);
      row.remaining         = row.items.reduce((s, li) => s + li.remaining, 0);
      row.sell_through_30d_pct        = pct(row.sold_30d,       row.qty_purchased);
      row.sell_through_same_month_pct = pct(row.sold_same_month, row.qty_purchased);
      row.sell_through_same_year_pct  = pct(row.sold_same_year,  row.qty_purchased);
      row.purchase_cost     = row.items.reduce((s, li) => s + li.purchase_cost, 0);
      row.revenue_30d       = row.items.reduce((s, li) => s + li.revenue_30d, 0);
      row.revenue_same_month = row.items.reduce((s, li) => s + li.revenue_same_month, 0);
      row.revenue_same_year  = row.items.reduce((s, li) => s + li.revenue_same_year, 0);
      row.gp_30d            = row.items.reduce((s, li) => s + li.gp_30d, 0);
      row.gp_margin_30d_pct = pct(row.gp_30d, row.revenue_30d);
      row.roi_30d_pct       = pct(row.gp_30d, row.purchase_cost);
      row.cash_locked_inventory             = row.items.reduce((s, li) => s + li.inventory_value_remaining, 0);
      row.potential_inventory_reduction_value = row.items.reduce((s, li) => s + li.inventory_reduction_value, 0);
      row.dead_stock_value  = row.items.filter(li => li.dead_stock).reduce((s, li) => s + li.inventory_value_remaining, 0);
      row.overstock_value   = row.items.filter(li => li.overstock || li.slow_moving).reduce((s, li) => s + li.inventory_value_remaining, 0);
      row.dead_stock_sheets = row.items.filter(li => li.dead_stock).reduce((s, li) => s + li.remaining, 0);
      row.slow_moving_sheets = row.items.filter(li => li.slow_moving).reduce((s, li) => s + li.remaining, 0);
      row.inventory_reduction_recommendations = row.items
        .filter(li => li.inventory_reduction_value > 0)
        .sort((a, b) =>
          priorityValue(b.reduction_priority) - priorityValue(a.reduction_priority) ||
          b.inventory_reduction_value - a.inventory_reduction_value,
        )
        .slice(0, 12) as unknown as AnyObj[];
      row.items = row.items.sort((a, b) => b.sold_30d - a.sold_30d);
    }

    // 13. Build summary, monthly, and yearly aggregations.
    const summary = {
      mirpo_count:     rows.length,
      qty_purchased:   rows.reduce((s, r) => s + r.qty_purchased, 0),
      crates:          rows.reduce((s, r) => s + r.crates, 0),
      sold_30d:        rows.reduce((s, r) => s + r.sold_30d, 0),
      sold_same_month: rows.reduce((s, r) => s + r.sold_same_month, 0),
      sold_same_year:  rows.reduce((s, r) => s + r.sold_same_year, 0),
      remaining_30d:   rows.reduce((s, r) => s + r.remaining_30d, 0),
      remaining_same_month: rows.reduce((s, r) => s + r.remaining_same_month, 0),
      remaining_same_year:  rows.reduce((s, r) => s + r.remaining_same_year, 0),
      remaining:       rows.reduce((s, r) => s + r.remaining, 0),
      purchase_cost:   rows.reduce((s, r) => s + r.purchase_cost, 0),
      revenue_30d:     rows.reduce((s, r) => s + r.revenue_30d, 0),
      gp_30d:          rows.reduce((s, r) => s + r.gp_30d, 0),
      cash_locked_inventory: rows.reduce((s, r) => s + r.cash_locked_inventory, 0),
      potential_inventory_reduction_value: rows.reduce((s, r) => s + r.potential_inventory_reduction_value, 0),
      dead_stock_value:  rows.reduce((s, r) => s + r.dead_stock_value, 0),
      overstock_value:   rows.reduce((s, r) => s + r.overstock_value, 0),
      dead_stock_sheets: rows.reduce((s, r) => s + r.dead_stock_sheets, 0),
      slow_moving_sheets: rows.reduce((s, r) => s + r.slow_moving_sheets, 0),
      sell_through_30d_pct: 0,
      sell_through_same_month_pct: 0,
      sell_through_same_year_pct: 0,
      roi_30d_pct: 0,
      gp_margin_30d_pct: 0,
      next_mirpo_recommendation: undefined as ReturnType<typeof buildNextMirpoRecommendation> | undefined,
    };
    summary.sell_through_30d_pct        = pct(summary.sold_30d,       summary.qty_purchased);
    summary.sell_through_same_month_pct = pct(summary.sold_same_month, summary.qty_purchased);
    summary.sell_through_same_year_pct  = pct(summary.sold_same_year,  summary.qty_purchased);
    summary.roi_30d_pct                 = pct(summary.gp_30d, summary.purchase_cost);
    summary.gp_margin_30d_pct           = pct(summary.gp_30d, summary.revenue_30d);
    summary.next_mirpo_recommendation   = buildNextMirpoRecommendation(rows as AnyObj[]);

    const monthly = groupByMonth(rows);
    const yearly  = groupByYear(rows);

    const inventory_reduction_recommendations = (rows
      .flatMap(r =>
        (r.inventory_reduction_recommendations || []).map((i: AnyObj) => ({
          ...i, purchaseorder_number: r.purchaseorder_number, po_date: r.date,
        } as AnyObj)),
      ) as AnyObj[])
      .sort((a, b) =>
        priorityValue(s(b.reduction_priority)) - priorityValue(s(a.reduction_priority)) ||
        n(b.inventory_reduction_value) - n(a.inventory_reduction_value),
      )
      .slice(0, 20);

    return NextResponse.json({
      success: true, from, to,
      rows, monthly, yearly, summary,
      inventory_reduction_recommendations,
    });

  } catch (err) {
    console.error('[MIRPO Analysis]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
