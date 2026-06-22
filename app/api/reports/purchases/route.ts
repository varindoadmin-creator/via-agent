import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}${path}${sep}organization_id=${orgId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal: controller.signal,
    });
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractBrand(sku: string): string {
  if (!sku) return 'Unknown';
  const prefix = sku.split('-')[0].toUpperCase();
  const brandMap: Record<string, string> = {
    'LAM': 'Lamitak', 'EDL': 'EDL', 'EAS': 'EDL',
    'AICA': 'AICA', 'TACO': 'TACO', 'TAC': 'TACO',
    'CARTA': 'CARTA', 'AIDI': 'AIDI',
  };
  return brandMap[prefix] || prefix;
}

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'this_month':
      return { from: `${y}-${String(m+1).padStart(2,'0')}-01`, to: `${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}` };
    case 'prev_month': {
      const pm = m === 0 ? 11 : m-1; const py = m === 0 ? y-1 : y;
      return { from: `${py}-${String(pm+1).padStart(2,'0')}-01`, to: `${py}-${String(pm+1).padStart(2,'0')}-${new Date(py,pm+1,0).getDate()}` };
    }
    case 'this_year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'prev_year': return { from: `${y-1}-01-01`, to: `${y-1}-12-31` };
    default:
      return { from: `${y}-${String(m+1).padStart(2,'0')}-01`, to: `${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}` };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') || 'item';
  const period = searchParams.get('period') || 'this_month';

  try {
    const { from, to } = getDateRange(period);

    if (type === 'item') {
      const data = await zohoGet(`/reports/purchasesbyitem?from_date=${from}&to_date=${to}`);
      const rows = (data.purchases_by_item || []).map((s: Record<string, unknown>) => ({
        name: String(s.item_name || ''),
        sku: String((s as Record<string, Record<string, string>>).item?.sku || ''),
        quantity: Number(s.quantity_purchased) || 0,
        amount: Number(s.amount) || 0,
        avg_price: Number(s.average_price) || 0,
      }));
      return NextResponse.json({ success: true, rows, from, to });
    }

    // brand / location / vendor - aggregate from bills
    const allBills: Record<string, unknown>[] = [];
    let page = 1;
    while (true) {
      const data = await zohoGet(`/bills?date_start=${from}&date_end=${to}&per_page=200&page=${page}`);
      const batch = (data.bills || []) as Record<string, unknown>[];
      allBills.push(...batch);
      if (batch.length < 200) break;
      page++;
      if (page > 10) break;
    }

    const aggregated = new Map<string, { quantity: number; amount: number; count: number }>();

    for (const bill of allBills) {
      const billId = String(bill.bill_id);
      const vendorName = String(bill.vendor_name || 'Unknown');

      try {
        const detail = await zohoGet(`/bills/${billId}`);
        const lineItems = (detail.bill?.line_items || []) as Record<string, unknown>[];

        for (const li of lineItems) {
          const sku = String(li.sku || '');
          const qty = Number(li.quantity) || 0;
          const amt = Number(li.item_total) || 0;
          const lineLocation = String(li.location_name || bill.location_name || 'Unknown');

          let key = '';
          if (type === 'brand') key = extractBrand(sku);
          else if (type === 'location') key = lineLocation;
          else if (type === 'vendor') key = vendorName;

          if (!key) continue;
          const ex = aggregated.get(key) || { quantity: 0, amount: 0, count: 0 };
          aggregated.set(key, {
            quantity: ex.quantity + qty,
            amount: ex.amount + amt,
            count: type === 'vendor' ? ex.count + 1 : ex.count,
          });
        }
      } catch { /* skip */ }
    }

    const rows = Array.from(aggregated.entries()).map(([key, val]) => ({
      name: key,
      quantity: val.quantity,
      amount: val.amount,
      avg_price: val.quantity > 0 ? val.amount / val.quantity : 0,
      count: val.count,
    }));

    return NextResponse.json({ success: true, rows, from, to, bill_count: allBills.length });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
