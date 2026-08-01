import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache: { expiresAt: number; payload: unknown } | null = null;

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${getZohoApiBaseUrl()}${path}${sep}organization_id=${getZohoOrgId()}`;
  const res = await fetchWithRetry(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const body = await res.json();
  if (!res.ok || (body.code !== undefined && body.code !== 0)) throw new Error(`Zoho ${res.status}: ${body.message || JSON.stringify(body)}`);
  return body;
}

async function fetchAllInvoices(dateAfter: string) {
  const rows: Row[] = [];
  for (let page = 1; page <= 40; page++) {
    const data = await zohoGet(`/invoices?date_after=${dateAfter}&sort_column=date&sort_order=D&per_page=200&page=${page}`);
    const batch = (data.invoices || []) as Row[];
    rows.push(...batch);
    if (!data.page_context?.has_more_page && batch.length < 200) break;
  }
  return rows.filter(row => !['draft', 'void'].includes(String(row.status || '').toLowerCase()));
}

async function fetchSalespersonMap() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const result = new Map<string, string>();
  if (!base || !key) return result;
  try {
    const res = await fetch(`${base}/rest/v1/customer_salesperson_map?select=customer_id,salesperson_name,times_seen,last_seen_at&order=times_seen.desc,last_seen_at.desc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store',
    });
    if (!res.ok) return result;
    const rows = await res.json() as Array<{ customer_id: string; salesperson_name: string }>;
    for (const row of rows) {
      if (row.customer_id && row.salesperson_name && !result.has(row.customer_id)) result.set(row.customer_id, row.salesperson_name);
    }
  } catch { /* keep analysis available if the learned map is unavailable */ }
  return result;
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      result[current] = await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function daysBetween(a: string, b: string) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) return NextResponse.json(cache.payload);
  try {
    const now = new Date();
    const dateAfter = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
    const day90 = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const day180 = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10);
    const [invoices, salespersonMap] = await Promise.all([fetchAllInvoices(dateAfter), fetchSalespersonMap()]);
    const byCustomer = new Map<string, Row[]>();
    for (const invoice of invoices) {
      const id = String(invoice.customer_id || '');
      if (!id) continue;
      const list = byCustomer.get(id) || [];
      list.push(invoice);
      byCustomer.set(id, list);
    }

    const candidates = Array.from(byCustomer.entries()).flatMap(([customerId, rows]) => {
      rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      const dates = [...new Set(rows.map(row => String(row.date || '')).filter(Boolean))].sort();
      const intervals = dates.slice(1).map((date, index) => daysBetween(dates[index], date));
      const normalCycleDays = median(intervals);
      const lastOrderDate = dates[dates.length - 1] || '';
      const daysSinceLastOrder = lastOrderDate ? daysBetween(lastOrderDate, now.toISOString().slice(0, 10)) : 999;
      const revenue12m = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
      const recentRevenue = rows.filter(row => String(row.date || '') >= day90).reduce((sum, row) => sum + (Number(row.total) || 0), 0);
      const previousRevenue = rows.filter(row => String(row.date || '') >= day180 && String(row.date || '') < day90).reduce((sum, row) => sum + (Number(row.total) || 0), 0);
      const declinePercent = previousRevenue > 0 ? Math.round((1 - recentRevenue / previousRevenue) * 100) : 0;
      const valuable = revenue12m >= 10_000_000 || rows.length >= 3;
      const cycleOverdue = normalCycleDays > 0 && daysSinceLastOrder > Math.max(45, Math.round(normalCycleDays * 1.5));
      const declining = previousRevenue >= 5_000_000 && declinePercent >= 40;
      if (!valuable || (!cycleOverdue && !declining)) return [];
      const latest = rows[0];
      return [{
        customer_id: customerId,
        customer_name: String(latest.customer_name || 'Unknown customer'),
        salesperson_name: String(latest.salesperson_name || salespersonMap.get(customerId) || 'Unassigned'),
        last_order_date: lastOrderDate,
        days_since_last_order: daysSinceLastOrder,
        normal_cycle_days: normalCycleDays,
        revenue_12m: revenue12m,
        recent_revenue_90d: recentRevenue,
        previous_revenue_90d: previousRevenue,
        decline_percent: Math.max(0, declinePercent),
        reasons: [cycleOverdue ? `No reorder after normal ${normalCycleDays}-day cycle` : '', declining ? `Revenue declined ${declinePercent}%` : ''].filter(Boolean),
        invoice_ids: rows.slice(0, 3).map(row => String(row.invoice_id || '')).filter(Boolean),
        score: revenue12m * (cycleOverdue ? 1.5 : 1) * (declining ? 1.25 : 1),
      }];
    }).sort((a, b) => b.score - a.score).slice(0, 40);

    const enriched = await mapLimit(candidates, 6, async candidate => {
      const details = await mapLimit(candidate.invoice_ids, 3, async id => {
        try { return (await zohoGet(`/invoices/${id}`)).invoice as Row; } catch { return null; }
      });
      const products = new Map<string, { code: string; name: string; quantity: number; revenue: number }>();
      for (const invoice of details) {
        if (!invoice) continue;
        for (const line of (invoice.line_items || []) as Row[]) {
          const code = String(line.sku || line.item_name || line.name || 'Unknown item');
          const current = products.get(code) || { code, name: String(line.name || line.item_name || code), quantity: 0, revenue: 0 };
          current.quantity += Number(line.quantity) || 0;
          current.revenue += Number(line.item_total || line.line_item_total || 0);
          products.set(code, current);
        }
      }
      const recommendations = Array.from(products.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 3);
      const detailSalesperson = details.map(invoice => String(invoice?.salesperson_name || '')).find(Boolean);
      const productText = recommendations.length ? recommendations.map(product => `${product.code} (${product.name})`).join(', ') : 'produk yang biasa Anda gunakan';
      const followUpMessage = [
        `Halo ${candidate.customer_name},`, '',
        `Kami dari Varindo ingin follow up kebutuhan HPL Anda. Terakhir tercatat pemesanan pada ${candidate.last_order_date}.`,
        `Berdasarkan riwayat sebelumnya, mungkin Anda membutuhkan kembali: ${productText}.`, '',
        'Apakah ada project atau kebutuhan stok yang bisa kami bantu siapkan? Kami akan konfirmasi harga dan ketersediaan sebelum pemesanan.', '',
        'Terima kasih,', 'Tim Varindo',
      ].join('\n');
      const { invoice_ids: _invoiceIds, score: _score, ...publicCandidate } = candidate;
      return { ...publicCandidate, salesperson_name: detailSalesperson || publicCandidate.salesperson_name, recommended_products: recommendations, follow_up_message: followUpMessage };
    });

    const groups = Array.from(new Set(enriched.map(row => row.salesperson_name))).sort().map(salesperson => ({
      salesperson,
      customers: enriched.filter(row => row.salesperson_name === salesperson),
    }));
    const payload = { success: true, generated_at: now.toISOString(), customer_count: enriched.length, groups };
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, payload };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[CustomerGrowthAlerts]', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
