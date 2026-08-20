import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { cached } from '@/lib/jarvis/cache';
import { zohoRequest } from '@/lib/zoho/client';
import { analyzeInventory, type InventoryExceptionInput } from '@/lib/inventory/exceptionAnalysis';

type Row = Record<string, unknown>;
const monthParameters = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });
const emptyParameters = z.object({});

function monthBounds(month: string) {
  const [year, number] = month.split('-').map(Number);
  if (!year || number < 1 || number > 12) throw new Error('Invalid month.');
  return { from: `${month}-01`, to: `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}` };
}

async function all(path: string, key: string, queryParams: Record<string, string> = {}) {
  const rows: Row[] = [];
  for (let page = 1; page <= 20; page++) {
    const response = await zohoRequest<Row>(path, { queryParams: { ...queryParams, per_page: '200', page: String(page) } });
    const batch = (response[key] || []) as Row[];
    rows.push(...batch);
    if (!Boolean((response.page_context as Row | undefined)?.has_more_page) && batch.length < 200) return { rows, coverageComplete: true };
  }
  return { rows, coverageComplete: false };
}

async function concurrencyMap<T, R>(rows: T[], limit: number, worker: (row: T) => Promise<R>) {
  const output = new Array<R>(rows.length); let cursor = 0;
  async function run() { while (cursor < rows.length) { const index = cursor++; output[index] = await worker(rows[index]); } }
  await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, run));
  return output;
}

function n(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function s(value: unknown) { return String(value || '').trim(); }

async function grossProfit(month: string) {
  const { from, to } = monthBounds(month);
  const [headers, items] = await Promise.all([
    all('/invoices', 'invoices', { date_start: from, date_end: to }),
    all('/items', 'items'),
  ]);
  if (!headers.coverageComplete || !items.coverageComplete) throw new Error('Zoho pagination exceeded the verified GP coverage limit.');
  const invoices = headers.rows.filter(row => !['draft', 'void'].includes(s(row.status).toLowerCase()));
  const rates = new Map<string, number>();
  for (const item of items.rows) {
    const rate = n(item.purchase_rate), id = s(item.item_id), sku = s(item.sku).toUpperCase(), name = s(item.name);
    if (id) rates.set(id, rate); if (sku) rates.set(`sku:${sku}`, rate); if (name) rates.set(`name:${name}`, rate);
  }
  const details = await concurrencyMap(invoices, 6, async header => {
    try { const response = await zohoRequest<Row>(`/invoices/${encodeURIComponent(s(header.invoice_id))}`); return (response.invoice || null) as Row | null; }
    catch { return null; }
  });
  if (details.some(detail => !detail)) throw new Error(`Could not load ${details.filter(detail => !detail).length} of ${invoices.length} invoice details. No partial GP result was returned.`);
  let revenue = 0, cost = 0, missingCostLines = 0;
  const brands = new Map<string, { revenue: number; cost: number }>();
  for (const invoice of details as Row[]) for (const line of (invoice.line_items || []) as Row[]) {
    const quantity = n(line.quantity), lineRevenue = n(line.item_total ?? line.amount);
    const rate = n(line.purchase_rate ?? line.cost_price) || rates.get(s(line.item_id)) || rates.get(`sku:${s(line.sku).toUpperCase()}`) || rates.get(`name:${s(line.name || line.item_name)}`) || 0;
    const lineCost = rate * quantity; revenue += lineRevenue; cost += lineCost;
    if (rate <= 0 && lineRevenue > 0) missingCostLines++;
    const rawBrand = s(line.brand || line.cf_brand) || s(line.sku).split(/[-\s]/)[0] || 'UNASSIGNED';
    const brand = rawBrand.toUpperCase() === 'TAC' ? 'TACO' : rawBrand.toUpperCase();
    const row = brands.get(brand) || { revenue: 0, cost: 0 }; row.revenue += lineRevenue; row.cost += lineCost; brands.set(brand, row);
  }
  const gp = revenue - cost;
  return {
    month, from, to, revenue_before_ppn: revenue, cost_at_current_purchase_rate: cost,
    gross_profit: gp, gross_margin: revenue > 0 ? gp / revenue : null,
    invoice_count: invoices.length, missing_cost_lines: missingCostLines,
    by_brand: [...brands].map(([name, row]) => ({ name, revenue: row.revenue, cost: row.cost, gross_profit: row.revenue - row.cost, gross_margin: row.revenue > 0 ? (row.revenue - row.cost) / row.revenue : null })).sort((a, b) => b.gross_profit - a.gross_profit).slice(0, 15),
  };
}

export const analyzeGrossProfitTool = tool<typeof monthParameters, JarvisRunContext>({
  name: 'analyze_gross_profit',
  description: 'Calculate verified monthly gross profit and gross margin from all issued Zoho invoice lines using current item purchase rates, including top brand contributions. Rejects partial detail coverage. Cost basis is current purchase rate, not historical landed cost.',
  parameters: monthParameters,
  async execute({ month }, context) {
    return { source: 'Zoho Books issued invoice details and current item purchase rates', basis: 'Draft and void invoices excluded. Current purchase rate × invoiced quantity; not historical landed cost.', ...(await cached(context, `analytics:gp:${month}`, () => grossProfit(month))) };
  },
});

function dateAgo(days: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); }
export const analyzeInventoryRiskTool = tool<typeof emptyParameters, JarvisRunContext>({
  name: 'analyze_inventory_risk',
  description: 'Scan active Zoho items and deterministic 90/365-day sales velocity for stockout, negative stock, slow-moving, and aging inventory exceptions. Returns summary counts and highest-priority alerts; recommendations require human approval.',
  parameters: emptyParameters,
  async execute(_input, context) {
    return cached(context, 'analytics:inventory-risk', async () => {
      const [itemsResult, sales90, sales365] = await Promise.all([
        all('/items', 'items', { filter_by: 'Status.Active' }),
        zohoRequest<Row>('/reports/salesbyitem', { queryParams: { from_date: dateAgo(90), to_date: new Date().toISOString().slice(0, 10) } }),
        zohoRequest<Row>('/reports/salesbyitem', { queryParams: { from_date: dateAgo(365), to_date: new Date().toISOString().slice(0, 10) } }),
      ]);
      if (!itemsResult.coverageComplete) throw new Error('Active-item coverage exceeded the verified limit.');
      const salesMap = (rows: Row[]) => new Map(rows.flatMap(row => [s(row.item_id), s(row.sku).toUpperCase(), s(row.item_name).toUpperCase()].filter(Boolean).map(key => [key, n(row.quantity_sold)] as const)));
      const map90 = salesMap((sales90.sales || []) as Row[]), map365 = salesMap((sales365.sales || []) as Row[]);
      const sold = (item: Row, map: Map<string, number>) => map.get(s(item.item_id)) ?? map.get(s(item.sku).toUpperCase()) ?? map.get(s(item.name).toUpperCase()) ?? 0;
      const inputs: InventoryExceptionInput[] = itemsResult.rows.map(item => ({ item_id: s(item.item_id), name: s(item.name), sku: s(item.sku), unit: s(item.unit), stock_on_hand: n(item.stock_on_hand), available_stock: n(item.available_stock), committed_stock: n(item.committed_stock), reorder_level: n(item.reorder_level), sold_90_days: sold(item, map90), sold_365_days: sold(item, map365) }));
      const alerts = analyzeInventory(inputs);
      const counts = alerts.reduce<Record<string, number>>((result, alert) => { result[alert.type] = (result[alert.type] || 0) + 1; return result; }, {});
      return { source: 'Zoho Books active items and sales-by-item reports', scanned_items: inputs.length, total_alerts: alerts.length, counts, highest_priority_alerts: alerts.slice(0, 30), limitation: 'Company-wide velocity; location transfer recommendations require location-detail analysis. System stock is not physical confirmation.' };
    });
  },
});
