import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function sbUrl(path: string) {
  return `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${path}`;
}

interface SentLogRow {
  invoice_id: string;
  sent_at: string;
}

/** invoice_id -> sent_at. Soft-fails to an empty map if the table isn't migrated yet. */
async function fetchSentMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(sbUrl('tax_invoice_sent_log?select=invoice_id,sent_at&limit=5000'), { headers: sbHeaders() });
    if (!res.ok) return map;
    const rows = (await res.json()) as SentLogRow[];
    for (const row of rows) map.set(row.invoice_id, row.sent_at);
  } catch { /* soft-fail — REMARKS just shows Not Sent for everything */ }
  return map;
}

function getDateRange(period: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'prev_month') {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    return {
      from: `${py}-${String(pm+1).padStart(2,'0')}-01`,
      to: `${py}-${String(pm+1).padStart(2,'0')}-${new Date(py,pm+1,0).getDate()}`,
    };
  }
  // this_month default
  return {
    from: `${y}-${String(m+1).padStart(2,'0')}-01`,
    to: `${y}-${String(m+1).padStart(2,'0')}-${new Date(y,m+1,0).getDate()}`,
  };
}

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get('period') || 'this_month';
  try {
    const token = await getZohoAccessToken();
    const base = getZohoApiBaseUrl();
    const orgId = getZohoOrgId();
    const { from, to } = getDateRange(period);

    // Fetch all invoices in date range, sorted date desc
    const allInvoices: Record<string, unknown>[] = [];
    let page = 1;
    while (true) {
      const res = await fetchWithRetry(
        `${base}/invoices?date_start=${from}&date_end=${to}&per_page=200&page=${page}&sort_column=date&sort_order=D&organization_id=${orgId}`,
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
      );
      const data = await res.json();
      const batch = (data.invoices || []) as Record<string, unknown>[];
      allInvoices.push(...batch);
      if (batch.length < 200) break;
      page++;
      if (page > 10) break;
    }

    const sentMap = await fetchSentMap();

    const invoices = allInvoices.map(inv => {
      const sentAt = sentMap.get(String(inv.invoice_id)) || null;
      return {
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        customer_name: inv.customer_name,
        date: inv.date,
        due_date: inv.due_date,
        status: inv.status,
        total: Number(inv.total) || 0,
        balance: Number(inv.balance) || 0,
        cf_npwp: inv.cf_npwp || '',
        cf_customer_po_no: inv.cf_customer_po_no || '',
        has_attachment: Boolean(inv.has_attachment),
        document_sent: sentAt !== null,
        document_sent_at: sentAt,
      };
    });

    return NextResponse.json({ success: true, invoices, from, to });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
