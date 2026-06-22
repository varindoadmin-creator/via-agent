import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';

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
    const body = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function safeGet(path: string) {
  try { return await zohoGet(path); } catch { return {}; }
}

async function getSheetNewCount(tabName: string): Promise<number> {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const sheetId = process.env.GOOGLE_SHEET_ID_REQUESTS;
    if (!email || !key || !sheetId) return 0;
    const auth = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[tabName];
    if (!sheet) return 0;
    const rows = await sheet.getRows();
    return rows.filter(r => !r.get('Status') || r.get('Status') === 'New').length;
  } catch { return 0; }
}

function fmt(n: number) {
  return 'Rp ' + Number(n).toLocaleString('id-ID');
}

export async function GET() {
  try {
    await getZohoAccessToken();

    const [
      overdueInv, draftInv, confirmedSOs,
      shippedPkgs, notShippedPkgs, deliveredShips,
      draftPOs, recentCustomers,
      newQuotes, newSamples, newCatalogues,
    ] = await Promise.all([
      safeGet('/invoices?status=overdue&per_page=200'),
      safeGet('/invoices?status=draft&per_page=200'),
      safeGet('/salesorders?status=confirmed&invoiced_status=not_invoiced&per_page=200'),
      safeGet('/packages?status=shipped&per_page=200'),
      safeGet('/packages?status=not_shipped&per_page=200'),
      safeGet('/shipmentorders?status=delivered&per_page=200'),
      safeGet('/purchaseorders?status=pending_approval&per_page=200'),
      safeGet('/contacts?contact_type=customer&sort_column=created_time&sort_order=D&per_page=50'),
      getSheetNewCount('Quote Requests'),
      getSheetNewCount('Sample Requests'),
      getSheetNewCount('Catalogue Requests'),
    ]);

    // Count SOs with no sub-status set (not yet stock-checked)
    const soNeedingAttention = (confirmedSOs.salesorders || []).filter((so: Record<string, unknown>) =>
      !so.current_sub_status || String(so.current_sub_status) === 'open'
    ).length;

    const overdueList = (overdueInv.invoices || []) as Record<string, unknown>[];
    const soList = (confirmedSOs.salesorders || []) as Record<string, unknown>[];
    const allActivePkgs = [
      ...(shippedPkgs.packages || []),
      ...(notShippedPkgs.packages || []),
    ] as Record<string, unknown>[];
    const deliveredList = (deliveredShips.shipmentorders || []) as Record<string, unknown>[];

    const activeSoIds = new Set(allActivePkgs.map(p => String(p.salesorder_id)));
    const deliveredSoIds = new Set(deliveredList.map(s => String(s.salesorder_id)));

    // Delivered not invoiced = delivered shipment + no active package + not invoiced
    const deliveredNotInvoiced = soList.filter(so =>
      deliveredSoIds.has(String(so.salesorder_id)) &&
      !activeSoIds.has(String(so.salesorder_id)) &&
      String(so.invoiced_status) !== 'invoiced'
    );

    // New customers last 7 days
    const day7ago = new Date();
    day7ago.setDate(day7ago.getDate() - 7);
    const newCustCount = ((recentCustomers.contacts || []) as Record<string, unknown>[])
      .filter(c => String(c.created_time || '') >= day7ago.toISOString()).length;

    const overdueTotal = overdueList.reduce((s, i) => s + (Number(i.balance) || 0), 0);
    const deliveredTotal = deliveredNotInvoiced.reduce((s, so) => s + (Number(so.total) || 0), 0);

    // Build briefing text
    const urgentItems = [];
    const followUpItems = [];
    const infoItems = [];

    // 🔴 Urgent
    if (overdueList.length > 0)
      urgentItems.push(`**Overdue Invoices** — ${overdueList.length} invoices, ${fmt(overdueTotal)} outstanding → [Invoices](/print)`);
    if ((draftInv.invoices || []).length > 0)
      urgentItems.push(`**Draft Invoices** — ${(draftInv.invoices || []).length} drafts to review stock & send → [Invoices](/print)`);
    if (deliveredNotInvoiced.length > 0)
      urgentItems.push(`**Delivered Not Invoiced** — ${deliveredNotInvoiced.length} SOs ready, ${fmt(deliveredTotal)} → [Sales Orders](/shipments)`);
    if (newQuotes > 0)
      urgentItems.push(`**New Quote Requests** — ${newQuotes} uncontacted → [Quotes](/requests/quotes)`);
    if (newSamples > 0)
      urgentItems.push(`**New Sample Requests** — ${newSamples} uncontacted → [Samples](/requests/samples)`);
    if (newCatalogues > 0)
      urgentItems.push(`**New Catalogue Requests** — ${newCatalogues} uncontacted → [Catalogues](/requests/catalogues)`);

    // 🟡 Follow up
    const notReadyCount = soList.filter(so => !activeSoIds.has(String(so.salesorder_id)) && !deliveredSoIds.has(String(so.salesorder_id))).length;
    if (notReadyCount > 0)
      followUpItems.push(`**Confirmed SOs Not Ready** — ${notReadyCount} orders pending packing → [Sales Orders](/shipments)`);
    if (activeSoIds.size > 0)
      followUpItems.push(`**Pending Delivery** — ${activeSoIds.size} shipments in transit → [Sales Orders](/shipments)`);
    if ((draftPOs.purchaseorders || []).length > 0)
      followUpItems.push(`**Draft POs Awaiting Approval** — ${(draftPOs.purchaseorders || []).length} POs to review → [Purchase Orders](/purchases)`);
    if (soNeedingAttention > 0)
      followUpItems.push(`**Confirmed SOs Stock Unchecked** — ${soNeedingAttention} SOs need stock review → [Sales Orders](/shipments)`);

    // 🟢 Info
    infoItems.push(`**New Customers This Week** — ${newCustCount} new customers → [Customers](/customers)`);

    const lines = [
      '**🔴 Urgent — Action Needed Today**',
      urgentItems.length > 0 ? urgentItems.map(i => `• ${i}`).join('\n') : '• ✓ Nothing urgent right now',
      '',
      '**🟡 Follow Up**',
      followUpItems.length > 0 ? followUpItems.map(i => `• ${i}`).join('\n') : '• ✓ Nothing to follow up',
      '',
      '**🟢 Good to Know**',
      infoItems.map(i => `• ${i}`).join('\n'),
    ];

    // Build actions list — things VIA can do automatically
    const actions: Array<{
      id: string;
      label: string;
      description: string;
      count: number;
      endpoint: string;
      method: string;
      color: string;
    }> = [];

    const readyDraftCount = (draftInv.invoices || []).length; // fetching detail is too slow here, show all drafts
    if (readyDraftCount > 0) {
      actions.push({
        id: 'mark_drafts_sent',
        label: '▶ Mark Ready Drafts as Sent',
        description: `Check & send all ready draft invoices`,
        count: readyDraftCount,
        endpoint: '/api/invoices-page/auto-send',
        method: 'POST',
        color: 'accent',
      });
    }

    if (deliveredNotInvoiced.length > 0) {
      actions.push({
        id: 'convert_delivered',
        label: '▶ Convert Delivered to Invoice',
        description: `Convert ${deliveredNotInvoiced.length} delivered SO${deliveredNotInvoiced.length > 1 ? 's' : ''} to draft invoices`,
        count: deliveredNotInvoiced.length,
        endpoint: '/api/shipments/auto-convert',
        method: 'POST',
        color: 'info',
      });
    }

    const readySOs = soList.filter((so: Record<string, unknown>) =>
      !activeSoIds.has(String(so.salesorder_id)) &&
      !deliveredSoIds.has(String(so.salesorder_id)) &&
      String(so.current_sub_status) !== 'cs_readyfo'
    ).length;

    if ((draftPOs.purchaseorders || []).length > 0) {
      actions.push({
        id: 'approve_pos',
        label: '▶ Approve Draft POs',
        description: `Approve ${(draftPOs.purchaseorders || []).length} draft purchase order${(draftPOs.purchaseorders || []).length > 1 ? 's' : ''}`,
        count: (draftPOs.purchaseorders || []).length,
        endpoint: '/api/purchases/auto-approve',
        method: 'POST',
        color: 'warning',
      });
    }

    return NextResponse.json({
      success: true,
      briefing: lines.join('\n'),
      actions,
    });

  } catch (err) {
    console.error('[Update] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
