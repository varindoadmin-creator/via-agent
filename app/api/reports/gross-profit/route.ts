import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';

export const maxDuration = 300;
type Row = Record<string, unknown>;

const money = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const text = (value: unknown) => String(value || '').trim();

function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must use YYYY-MM format.');
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) throw new Error('Invalid month.');
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetchWithRetry(
    `${getZohoApiBaseUrl()}${path}${separator}organization_id=${getZohoOrgId()}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
    { retries: 4, baseDelayMs: 4_000 },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Zoho ${response.status}: ${JSON.stringify(data)}`);
  return data as Row;
}

async function fetchAll(path: string, key: string) {
  const rows: Row[] = [];
  for (let page = 1; page <= 20; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const data = await zohoGet(`${path}${separator}per_page=200&page=${page}`);
    const batch = (data[key] || []) as Row[];
    rows.push(...batch);
    if (batch.length < 200) break;
  }
  return rows;
}

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return output;
}

function brandFor(line: Row, brands: Map<string, string>) {
  const explicit = text(line.brand || line.cf_brand);
  if (explicit) return explicit.toUpperCase();
  const itemId = text(line.item_id);
  const mapped = brands.get(itemId);
  if (mapped) return mapped;
  const sku = text(line.sku).toUpperCase();
  const prefix = sku.split(/[-\s]/)[0];
  if (prefix.startsWith('LAM')) return 'LAMITAK';
  return prefix || 'UNASSIGNED';
}

function rateFor(line: Row, rates: Map<string, number>) {
  const direct = money(line.purchase_rate ?? line.cost_price ?? line.purchase_price);
  if (direct > 0) return direct;
  const itemId = text(line.item_id);
  const sku = text(line.sku).toUpperCase();
  const name = text(line.name || line.item_name);
  return rates.get(itemId) || rates.get(`sku:${sku}`) || rates.get(`name:${name}`) || 0;
}

type Aggregate = { name: string; revenue: number; cost: number; gross_profit: number; quantity: number; invoice_ids: Set<string>; missing_cost_lines: number };
function add(map: Map<string, Aggregate>, name: string, invoiceId: string, revenue: number, cost: number, quantity: number, missingCost: boolean) {
  const key = name || 'Unassigned';
  const row = map.get(key) || { name: key, revenue: 0, cost: 0, gross_profit: 0, quantity: 0, invoice_ids: new Set<string>(), missing_cost_lines: 0 };
  row.revenue += revenue; row.cost += cost; row.gross_profit += revenue - cost; row.quantity += quantity;
  if (invoiceId) row.invoice_ids.add(invoiceId);
  if (missingCost && revenue > 0) row.missing_cost_lines += 1;
  map.set(key, row);
}

function serialize(map: Map<string, Aggregate>) {
  return [...map.values()].map(row => ({
    name: row.name, revenue: row.revenue, cost: row.cost, gross_profit: row.gross_profit,
    gp_margin: row.revenue > 0 ? row.gross_profit / row.revenue : 0,
    quantity: row.quantity, invoice_count: row.invoice_ids.size, missing_cost_lines: row.missing_cost_lines,
  })).sort((a, b) => b.gross_profit - a.gross_profit);
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = request.nextUrl.searchParams.get('month') || defaultMonth;
    const { from, to } = monthBounds(month);
    const [headers, items] = await Promise.all([
      fetchAll(`/invoices?date_start=${from}&date_end=${to}&sort_column=date&sort_order=A`, 'invoices'),
      fetchAll('/items', 'items'),
    ]);
    const invoices = headers.filter(invoice => !['void', 'draft'].includes(text(invoice.status).toLowerCase()));
    const rates = new Map<string, number>();
    const itemBrands = new Map<string, string>();
    for (const item of items) {
      const rate = money(item.purchase_rate);
      const itemId = text(item.item_id), sku = text(item.sku).toUpperCase(), name = text(item.name);
      if (itemId) rates.set(itemId, rate); if (sku) rates.set(`sku:${sku}`, rate); if (name) rates.set(`name:${name}`, rate);
      const brand = text(item.brand || item.cf_brand).toUpperCase();
      if (itemId && brand) itemBrands.set(itemId, brand);
    }
    const details = await mapLimit(invoices, 6, async invoice => {
      const id = text(invoice.invoice_id);
      try { const data = await zohoGet(`/invoices/${id}`); return (data.invoice || invoice) as Row; }
      catch (error) { return { ...invoice, _detail_error: error instanceof Error ? error.message : String(error) }; }
    });
    const failed = details.filter(invoice => invoice._detail_error);
    if (failed.length) throw new Error(`Could not load ${failed.length} of ${invoices.length} invoice details from Zoho. No partial GP report was returned.`);

    const brands = new Map<string, Aggregate>(), hubs = new Map<string, Aggregate>(), customers = new Map<string, Aggregate>();
    let revenue = 0, cost = 0, quantity = 0, missingCostLines = 0;
    for (const invoice of details) {
      const invoiceId = text(invoice.invoice_id), customer = text(invoice.customer_name) || 'Unknown Customer';
      const invoiceHub = text(invoice.location_name) || 'Other / Unassigned';
      for (const line of (invoice.line_items || []) as Row[]) {
        const qty = Number(line.quantity) || 0;
        const lineRevenue = money(line.item_total ?? line.amount);
        const purchaseRate = rateFor(line, rates);
        const lineCost = purchaseRate * qty;
        const missing = purchaseRate <= 0;
        const hub = text(line.location_name) || invoiceHub;
        revenue += lineRevenue; cost += lineCost; quantity += qty; if (missing && lineRevenue > 0) missingCostLines += 1;
        add(brands, brandFor(line, itemBrands), invoiceId, lineRevenue, lineCost, qty, missing);
        add(hubs, hub, invoiceId, lineRevenue, lineCost, qty, missing);
        add(customers, customer, invoiceId, lineRevenue, lineCost, qty, missing);
      }
    }
    return NextResponse.json({
      success: true, month, from, to,
      summary: { revenue, cost, gross_profit: revenue - cost, gp_margin: revenue > 0 ? (revenue - cost) / revenue : 0, quantity, invoice_count: invoices.length, missing_cost_lines: missingCostLines },
      groups: { brand: serialize(brands), hub: serialize(hubs), customer: serialize(customers) },
      basis: 'All issued invoices. Revenue before PPN minus current Zoho purchase rate × invoiced quantity. Draft and void invoices excluded.',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
