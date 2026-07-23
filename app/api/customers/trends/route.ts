import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchWithRetry(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: controller.signal });
    const body = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllPages(path: string, key: string, maxPages = 40) {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await zohoGet(path + sep + 'per_page=200&page=' + page);
    const batch = (res[key] || []) as Record<string, unknown>[];
    items.push(...batch);
    hasMore = batch.length === 200;
    page++;
    if (page > maxPages) break;
  }
  return items;
}

// ─── Month bucketing ──────────────────────────────────────────────────────────

const MONTHS_BACK = 12;

function lastNMonthKeys(n: number, now = new Date()) {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ─── In-memory response cache ──────────────────────────────────────────────────
// This route pages through every active contact plus every SO/invoice from the
// last 12 months (up to 8,000 records each, fetched in parallel) just to build
// monthly aggregates that don't change within a day. Uncached, every Customers
// page load re-runs the full Zoho fetch — cheap for one visit, but the process
// went dark for ~20h on 2026-07-23 right after this route shipped, on a host
// capped at 3GB RAM, so a short cache trades a bit of staleness for not redoing
// this work on every page view.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { points: unknown; expiresAt: number } | null = null;

// ─── GET /api/customers/trends ─────────────────────────────────────────────────

export async function GET() {
  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json({ success: true, points: cache.points });
  }

  try {
    await getZohoAccessToken();

    const now = new Date();
    const monthKeys = lastNMonthKeys(MONTHS_BACK, now);
    const earliestKey = monthKeys[0];
    const [ey, em] = earliestKey.split('-').map(Number);
    const dateAfter = `${ey}-${String(em).padStart(2, '0')}-01`;

    const [allCustomers, sos, invoices] = await Promise.all([
      fetchAllPages('/contacts?contact_type=customer&status=active&sort_column=created_time&sort_order=D', 'contacts'),
      fetchAllPages(`/salesorders?date_after=${dateAfter}&sort_column=date&sort_order=D`, 'salesorders'),
      fetchAllPages(`/invoices?date_after=${dateAfter}&sort_column=date&sort_order=D`, 'invoices'),
    ]);

    // created_time / date fields from Zoho are ISO-style strings ("YYYY-MM-DD...") —
    // slice(0,7) gives the month key directly without any timezone conversion.
    const createdMonths = allCustomers
      .map(c => String(c.created_time || '').slice(0, 7))
      .filter(Boolean)
      .sort();

    const activeByMonth = new Map<string, Set<string>>();
    for (const key of monthKeys) activeByMonth.set(key, new Set());
    for (const rec of [...sos, ...invoices]) {
      const cid = String(rec.customer_id || '');
      const monthKey = String(rec.date || '').slice(0, 7);
      if (!cid || !activeByMonth.has(monthKey)) continue;
      activeByMonth.get(monthKey)!.add(cid);
    }

    const points = monthKeys.map(key => {
      const newCount = createdMonths.filter(m => m === key).length;
      // cumulative — every customer created on or before the end of this month
      const totalCount = createdMonths.filter(m => m <= key).length;
      const activeCount = activeByMonth.get(key)?.size || 0;
      return {
        month: key,
        label: monthLabel(key),
        new_customers: newCount,
        total_customers: totalCount,
        active_customers: activeCount,
      };
    });

    cache = { points, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json({ success: true, points });

  } catch (err) {
    console.error('[Customers/Trends] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
