import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

function startOfThisMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function endOfThisMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0);
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function n(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v ?? '').replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function s(v: unknown): string {
  return String(v ?? '').trim();
}

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function detectBrand(name: string, sku: string): string {
  const n = name.toUpperCase();
  const sk = sku.toUpperCase();
  if (n.includes('LAMITAK') || sk.startsWith('LAM-')) return 'LAMITAK';
  if (n.includes('GREENLAM') || sk.startsWith('GREEN-')) return 'GREENLAM';
  if (n.includes(' EDL ') || n.startsWith('EDL ') || sk.startsWith('EDL-')) return 'EDL';
  if (n.includes('AICA') || sk.startsWith('AICA-')) return 'AICA';
  if (n.includes('TACO') || sk.startsWith('TACO-')) return 'TACO';
  if (n.includes('CARTA') || sk.startsWith('CARTA-')) return 'CARTA';
  if (n.includes('AIDI') || sk.startsWith('AIDI-')) return 'AIDI';
  if (n.includes('ECO') || sk.startsWith('ECO-')) return 'ECO';
  return 'OTHER';
}

async function getItemsSummaryAndPurchaseRates() {
  let page = 1;
  let stockValue = 0;
  let stockQty = 0;
  let itemCount = 0;
  let zeroOrMissingCostItems = 0;
  const purchaseRatesByItemId = new Map<string, number>();
  const purchaseRatesBySku = new Map<string, number>();
  const purchaseRatesByName = new Map<string, number>();
  const byBrand = new Map<string, { stockValue: number; stockQty: number; itemCount: number }>();

  while (page <= 25) {
    const data = await zohoGet(`/items?per_page=200&page=${page}`);
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      const itemId = s(item.item_id ?? item.id);
      const sku = s(item.sku ?? item.item_code ?? item.code).toUpperCase();
      const name = s(item.name ?? item.item_name).toUpperCase();
      const purchaseRate = n(item.purchase_rate ?? item.purchase_price ?? item.cost_price);

      if (itemId && purchaseRate > 0) purchaseRatesByItemId.set(itemId, purchaseRate);
      if (sku && purchaseRate > 0) purchaseRatesBySku.set(sku, purchaseRate);
      if (name && purchaseRate > 0) purchaseRatesByName.set(name, purchaseRate);

      const qty = n(item.stock_on_hand ?? item.available_stock ?? item.available_for_sale_stock ?? item.actual_available_stock);
      if (qty <= 0) continue;

      const brand = detectBrand(name, sku);
      const lineValue = qty * purchaseRate;

      stockQty += qty;
      stockValue += lineValue;
      itemCount += 1;
      if (purchaseRate <= 0) zeroOrMissingCostItems += 1;

      const b = byBrand.get(brand) ?? { stockValue: 0, stockQty: 0, itemCount: 0 };
      b.stockValue += lineValue;
      b.stockQty += qty;
      b.itemCount += 1;
      byBrand.set(brand, b);
    }

    if (!data.page_context?.has_more_page || items.length === 0) break;
    page += 1;
  }

  return { stockValue, stockQty, itemCount, zeroOrMissingCostItems, purchaseRatesByItemId, purchaseRatesBySku, purchaseRatesByName, byBrand };
}

async function getInvoiceDetail(invoiceId: string) {
  const data = await zohoGet(`/invoices/${invoiceId}`);
  return data.invoice ?? data;
}

function getLinePurchaseRate(line: any, itemMaps: Awaited<ReturnType<typeof getItemsSummaryAndPurchaseRates>>) {
  const direct = n(line.purchase_rate ?? line.purchase_price ?? line.cost_price ?? line.item_purchase_rate);
  if (direct > 0) return direct;

  const itemId = s(line.item_id);
  if (itemId && itemMaps.purchaseRatesByItemId.has(itemId)) return itemMaps.purchaseRatesByItemId.get(itemId) || 0;

  const sku = s(line.sku ?? line.item_code ?? line.code).toUpperCase();
  if (sku && itemMaps.purchaseRatesBySku.has(sku)) return itemMaps.purchaseRatesBySku.get(sku) || 0;

  const name = s(line.name ?? line.item_name ?? line.description).toUpperCase();
  if (name && itemMaps.purchaseRatesByName.has(name)) return itemMaps.purchaseRatesByName.get(name) || 0;

  return 0;
}

async function getThisMonthSalesAndGp(itemMaps: Awaited<ReturnType<typeof getItemsSummaryAndPurchaseRates>>) {
  const from = ymd(startOfThisMonth());
  const to = ymd(endOfThisMonth());
  let page = 1;
  const invoices: any[] = [];

  while (page <= 10) {
    const data = await zohoGet(`/invoices?date_start=${from}&date_end=${to}&per_page=200&page=${page}`);
    const batch = Array.isArray(data.invoices) ? data.invoices : [];
    invoices.push(...batch.filter((inv: any) => !['void', 'draft'].includes(s(inv.status).toLowerCase())));
    if (!data.page_context?.has_more_page || batch.length === 0) break;
    page += 1;
  }

  let revenueBeforePpn = 0;
  let cogs = 0;
  let missingCostLines = 0;

  const details: any[] = [];
  for (let i = 0; i < invoices.length; i += 8) {
    const chunk = invoices.slice(i, i + 8);
    const settled = await Promise.allSettled(chunk.map(inv => getInvoiceDetail(s(inv.invoice_id ?? inv.id))));
    for (const result of settled) {
      if (result.status === 'fulfilled') details.push(result.value);
    }
  }

  for (const inv of details) {
    revenueBeforePpn += n(inv.sub_total ?? inv.subtotal ?? inv.total_before_tax ?? inv.total);
    const lines = Array.isArray(inv.line_items) ? inv.line_items : [];
    for (const line of lines) {
      const qty = n(line.quantity ?? line.qty);
      const purchaseRate = getLinePurchaseRate(line, itemMaps);
      if (qty > 0 && purchaseRate <= 0) missingCostLines += 1;
      cogs += qty * purchaseRate;
    }
  }

  const grossProfit = revenueBeforePpn - cogs;
  const gpMargin = revenueBeforePpn > 0 ? grossProfit / revenueBeforePpn : 0;

  return {
    from,
    to,
    revenueBeforePpn,
    cogs,
    grossProfit,
    gpMargin,
    invoiceCount: invoices.length,
    detailedInvoiceCount: details.length,
    missingCostLines,
  };
}

async function getTotalReceivables() {
  let page = 1;
  let totalReceivables = 0;
  let invoiceCount = 0;
  let overdueReceivables = 0;
  const today = ymd(new Date());

  while (page <= 25) {
    const data = await zohoGet(`/invoices?per_page=200&page=${page}`);
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    for (const inv of invoices) {
      const status = s(inv.status).toLowerCase();
      if (['void', 'draft', 'paid'].includes(status)) continue;
      const balance = n(inv.balance ?? inv.balance_due ?? inv.outstanding_balance);
      if (balance <= 0) continue;
      totalReceivables += balance;
      invoiceCount += 1;
      const dueDate = s(inv.due_date);
      if (dueDate && dueDate < today) overdueReceivables += balance;
    }
    if (!data.page_context?.has_more_page || invoices.length === 0) break;
    page += 1;
  }

  return { totalReceivables, invoiceCount, overdueReceivables };
}

export async function GET() {
  try {
    return await getDashboard();
  } catch (err) {
    return NextResponse.json({ success: false, errors: [String(err)], _fatal: true }, { status: 500 });
  }
}

async function getDashboard() {
  const errors: string[] = [];

  let itemMaps: Awaited<ReturnType<typeof getItemsSummaryAndPurchaseRates>> | null = null;
  try {
    itemMaps = await getItemsSummaryAndPurchaseRates();
  } catch (err) {
    errors.push(`inventory: ${err}`);
  }

  const safeItemMaps = itemMaps ?? {
    stockValue: 0,
    stockQty: 0,
    itemCount: 0,
    zeroOrMissingCostItems: 0,
    purchaseRatesByItemId: new Map<string, number>(),
    purchaseRatesBySku: new Map<string, number>(),
    purchaseRatesByName: new Map<string, number>(),
    byBrand: new Map<string, { stockValue: number; stockQty: number; itemCount: number }>(),
  };

  const [salesRes, receivablesRes] = await Promise.allSettled([
    getThisMonthSalesAndGp(safeItemMaps),
    getTotalReceivables(),
  ]);

  const sales = salesRes.status === 'fulfilled'
    ? salesRes.value
    : (errors.push(`sales/gp: ${salesRes.reason}`), {
      from: ymd(startOfThisMonth()),
      to: ymd(endOfThisMonth()),
      revenueBeforePpn: 0,
      cogs: 0,
      grossProfit: 0,
      gpMargin: 0,
      invoiceCount: 0,
      detailedInvoiceCount: 0,
      missingCostLines: 0,
    });

  const receivables = receivablesRes.status === 'fulfilled'
    ? receivablesRes.value
    : (errors.push(`receivables: ${receivablesRes.reason}`), { totalReceivables: 0, invoiceCount: 0, overdueReceivables: 0 });

  return NextResponse.json({
    success: errors.length === 0,
    generated_at: new Date().toISOString(),
    errors,
    monthly_sales: sales,
    gross_profit: {
      revenueBeforePpn: sales.revenueBeforePpn,
      cogs: sales.cogs,
      grossProfit: sales.grossProfit,
      gpMargin: sales.gpMargin,
      missingCostLines: sales.missingCostLines,
    },
    receivables,
    inventory_summary: {
      stockValue: safeItemMaps.stockValue,
      stockQty: safeItemMaps.stockQty,
      itemCount: safeItemMaps.itemCount,
      zeroOrMissingCostItems: safeItemMaps.zeroOrMissingCostItems,
      by_brand: Array.from(safeItemMaps.byBrand.entries())
        .map(([brand, v]) => ({ brand, ...v }))
        .sort((a, b) => b.stockValue - a.stockValue),
    },
  });
}

