import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${path}${sep}organization_id=${orgId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  return res.json();
}

export async function POST() {
  try {
    await getZohoAccessToken();

    // Fetch all draft invoices
    const draftData = await zohoGet('/invoices?status=draft&per_page=200');
    const drafts = draftData.invoices || [];

    const results: Array<{ invoice_number: string; success: boolean; skipped?: boolean; reason?: string; error?: string }> = [];

    for (const inv of drafts) {
      try {
        // Fetch detail to check stock per location
        const detail = await zohoGet('/invoices/' + inv.invoice_id);
        const lineItems = detail.invoice?.line_items || [];

        // Check per-location stock for each item
        const itemIds = [...new Set(lineItems.map((li: Record<string, unknown>) => String(li.item_id || '')).filter(Boolean))];
        const itemLocMap = new Map<string, number>();

        await Promise.all(itemIds.map(async (itemId: string) => {
          try {
            const itemDetail = await zohoGet('/items/' + itemId);
            for (const loc of itemDetail.item?.locations || []) {
              itemLocMap.set(itemId + '_' + String(loc.location_id), Number(loc.location_stock_on_hand) || 0);
            }
          } catch { /* skip */ }
        }));

        // Check all items are ready
        const allReady = lineItems.every((li: Record<string, unknown>) => {
          const qty = Number(li.quantity) || 0;
          const key = String(li.item_id) + '_' + String(li.location_id);
          const stock = itemLocMap.get(key) ?? Number(li.stock_on_hand) ?? 0;
          return stock >= qty;
        });

        if (!allReady) {
          results.push({ invoice_number: String(inv.invoice_number), success: false, skipped: true, reason: 'Insufficient stock' });
          continue;
        }

        // Mark as sent
        const token = await getZohoAccessToken();
        const base = getZohoApiBaseUrl();
        const orgId = getZohoOrgId();
        const res = await fetch(`${base}/invoices/${inv.invoice_id}/status/sent?organization_id=${orgId}`, {
          method: 'POST',
          headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const resData = await res.json();
        if (!res.ok && resData.code !== 0) throw new Error(resData.message || 'Failed');
        results.push({ invoice_number: String(inv.invoice_number), success: true });

      } catch (e) {
        results.push({ invoice_number: String(inv.invoice_number), success: false, error: String(e) });
      }
    }

    const sent = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;

    return NextResponse.json({ success: true, sent, skipped, failed, results });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
