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

    // Fetch confirmed SOs that are delivered but not invoiced
    const [confirmedSOs, deliveredShipments, activePkgs] = await Promise.all([
      zohoGet('/salesorders?status=confirmed&invoiced_status=not_invoiced&per_page=200'),
      zohoGet('/shipmentorders?status=delivered&per_page=200'),
      zohoGet('/packages?status=shipped&per_page=200'),
    ]);

    const soList = (confirmedSOs.salesorders || []) as Record<string, unknown>[];
    const deliveredIds = new Set((deliveredShipments.shipmentorders || []).map((s: Record<string, unknown>) => String(s.salesorder_id)));
    const activeIds = new Set((activePkgs.packages || []).map((p: Record<string, unknown>) => String(p.salesorder_id)));

    // Only fully delivered (delivered + no active packages) + not invoiced
    const toConvert = soList.filter(so =>
      deliveredIds.has(String(so.salesorder_id)) &&
      !activeIds.has(String(so.salesorder_id)) &&
      String(so.invoiced_status) !== 'invoiced'
    );

    const results: Array<{ so_number: string; invoice_number?: string; success: boolean; error?: string }> = [];

    for (const so of toConvert) {
      try {
        const token = await getZohoAccessToken();
        const base = getZohoApiBaseUrl();
        const orgId = getZohoOrgId();

        // Get delivery date from shipment
        const shipment = (deliveredShipments.shipmentorders || []).find(
          (s: Record<string, unknown>) => String(s.salesorder_id) === String(so.salesorder_id)
        ) as Record<string, unknown> | undefined;
        const deliveryDate = String(shipment?.date || new Date().toISOString().split('T')[0]);

        const res = await fetch(
          `${base}/invoices/fromsalesorder?salesorder_id=${so.salesorder_id}&organization_id=${orgId}`,
          {
            method: 'POST',
            headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: deliveryDate }),
          }
        );
        const data = await res.json();
        if (!res.ok && data.code !== 0) throw new Error(data.message || 'Failed to convert');
        results.push({
          so_number: String(so.salesorder_number),
          invoice_number: data.invoice?.invoice_number,
          success: true,
        });
      } catch (e) {
        results.push({ so_number: String(so.salesorder_number), success: false, error: String(e) });
      }
    }

    const converted = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({ success: true, converted, failed, results });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
