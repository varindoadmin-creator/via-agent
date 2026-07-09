import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { getCustomFieldValue, RawContact } from '@/lib/customerCleanup/rules';
import { findDuplicateGroups, DuplicateCandidate } from '@/lib/customerCleanup/duplicates';

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

async function fetchDetailBatch(ids: string[]): Promise<RawContact[]> {
  const BATCH = 15;
  const results: RawContact[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const details = await Promise.all(
      slice.map(async (id) => {
        try {
          const r = await zohoGet(`/contacts/${id}`);
          return (r.contact as RawContact & { email?: string; phone?: string; mobile?: string; status?: string }) || null;
        } catch {
          return null;
        }
      })
    );
    results.push(...(details.filter(Boolean) as RawContact[]));
  }
  return results;
}

// ─── GET /api/customers/duplicates — scan for likely duplicate customers ─────

export async function GET() {
  try {
    const ids = await fetchAllCustomerIds();
    const details = await fetchDetailBatch(ids);

    const candidates: DuplicateCandidate[] = details.map((c) => {
      const raw = c as RawContact & { email?: string; phone?: string; mobile?: string; status?: string };
      return {
        contact_id: c.contact_id,
        contact_name: c.contact_name || '',
        company_name: c.company_name || '',
        email: raw.email || '',
        phone: raw.phone || '',
        mobile: raw.mobile || '',
        npwp: getCustomFieldValue(c, 'cf_npwp') || '',
        status: raw.status || '',
      };
    });

    const groups = findDuplicateGroups(candidates);
    const duplicateCustomerCount = groups.reduce((sum, g) => sum + g.customers.length, 0);

    return NextResponse.json({
      success: true,
      total_customers: ids.length,
      group_count: groups.length,
      duplicate_customer_count: duplicateCustomerCount,
      groups,
    });
  } catch (err) {
    console.error('[Customer Duplicates] Scan error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
