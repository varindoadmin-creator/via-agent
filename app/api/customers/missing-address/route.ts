import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { isAddressEmpty, RawAddress } from '@/lib/customerCleanup/rules';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetchWithRetry(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: controller.signal });
    const body = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllCustomerIds(): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await zohoGet(`/contacts?contact_type=customer&per_page=200&page=${page}`);
    const batch = (res.contacts || []) as Array<{ contact_id: string }>;
    ids.push(...batch.map((c) => c.contact_id));
    hasMore = Boolean(res.page_context?.has_more_page);
    page++;
    if (page > 20) break;
  }
  return ids;
}

interface ContactDetail {
  contact_id: string;
  contact_name?: string;
  contact_number?: string;
  billing_address?: RawAddress;
  shipping_address?: RawAddress;
}

async function fetchDetailBatch(ids: string[]): Promise<ContactDetail[]> {
  const BATCH = 15;
  const results: ContactDetail[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const details = await Promise.all(
      slice.map(async (id) => {
        try {
          const r = await zohoGet(`/contacts/${id}`);
          return (r.contact as ContactDetail) || null;
        } catch {
          return null;
        }
      })
    );
    results.push(...(details.filter(Boolean) as ContactDetail[]));
  }
  return results;
}

// ─── GET /api/customers/missing-address — customers with no Billing and/or Shipping address ──

export async function GET() {
  try {
    const ids = await fetchAllCustomerIds();
    const details = await fetchDetailBatch(ids);

    const customers = details
      .map((c) => {
        const billingMissing = isAddressEmpty(c.billing_address);
        const shippingMissing = isAddressEmpty(c.shipping_address);
        if (!billingMissing && !shippingMissing) return null;
        return {
          contact_id: c.contact_id,
          contact_name: c.contact_name || '(unnamed)',
          contact_number: c.contact_number || '',
          billing_missing: billingMissing,
          shipping_missing: shippingMissing,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ success: true, total_customers: ids.length, missing_count: customers.length, customers });
  } catch (err) {
    console.error('[Missing Address] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
