import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl } from '@/lib/zoho/auth';

const ORG_ID = () => process.env.ZOHO_ORGANIZATION_ID || '';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${ORG_ID()}`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

// GET /api/invoices?customer=PATIO+LIVITY&from=2026-05-01&to=2026-05-31
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customer = searchParams.get('customer') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  try {
    let invoices: unknown[] = [];
    let customerInfo = null;

    if (customer) {
      // Search by customer + date range
      const custRes = await zohoGet(
        `/contacts?contact_name_contains=${encodeURIComponent(customer)}&contact_type=customer&per_page=10`
      );
      const contacts = custRes.contacts || [];
      if (contacts.length === 0) {
        return NextResponse.json({ success: true, invoices: [], message: `No customer found matching "${customer}"` });
      }
      const contact = contacts[0];
      customerInfo = { id: contact.contact_id, name: contact.contact_name };

      let path = `/invoices?customer_id=${contact.contact_id}&per_page=200&sort_column=date&sort_order=A`;
      if (from) path += `&date_start=${from}`;
      if (to)   path += `&date_end=${to}`;
      const invRes = await zohoGet(path);
      invoices = invRes.invoices || [];
    } else {
      // All invoices in date range — paginate if needed
      if (!from || !to) {
        return NextResponse.json({ error: 'from and to dates required when no customer specified' }, { status: 400 });
      }
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const path = `/invoices?date_start=${from}&date_end=${to}&per_page=200&page=${page}&sort_column=date&sort_order=A`;
        const invRes = await zohoGet(path);
        const batch = invRes.invoices || [];
        invoices = [...invoices, ...batch];
        hasMore = batch.length === 200;
        page++;
        if (page > 10) break; // Safety cap at 2000 invoices
      }
    }

    const mapped = (invoices as Record<string, unknown>[]).map(i => ({
      invoice_id: i.invoice_id,
      invoice_number: i.invoice_number,
      customer_name: i.customer_name,
      date: i.date,
      due_date: i.due_date,
      total: i.total,
      balance: i.balance,
      status: i.status,
    }));

    return NextResponse.json({
      success: true,
      customer: customerInfo,
      invoice_count: mapped.length,
      invoices: mapped,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
