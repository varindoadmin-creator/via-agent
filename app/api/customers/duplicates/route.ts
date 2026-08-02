import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { getCustomFieldValue, RawContact } from '@/lib/customerCleanup/rules';
import { findDuplicateGroups, DuplicateCandidate } from '@/lib/customerCleanup/duplicates';
import { duplicateGroupFingerprint, getIgnoredDuplicateFingerprints, ignoreDuplicateGroup } from '@/lib/customerDuplicates/ignoreStore';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';

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

async function zohoPost(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const response = await fetchWithRetry(`${base}${path}${sep}organization_id=${orgId}`, {
    method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.code !== undefined && body.code !== 0)) {
    throw new Error(body.message || `Zoho ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
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

async function scanDuplicates(includeIgnored = false) {
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

    const allGroups = findDuplicateGroups(candidates);
    const ignored = await getIgnoredDuplicateFingerprints();
    const groups = includeIgnored ? allGroups : allGroups.filter(group => !ignored.has(duplicateGroupFingerprint(group.customers.map(customer => customer.contact_id))));
    return { ids, groups, ignoredCount: allGroups.length - groups.length };
}

// ─── GET /api/customers/duplicates — scan for likely duplicate customers ─────
export async function GET() {
  try {
    const { ids, groups, ignoredCount } = await scanDuplicates();
    const duplicateCustomerCount = groups.reduce((sum, g) => sum + g.customers.length, 0);

    return NextResponse.json({
      success: true,
      total_customers: ids.length,
      group_count: groups.length,
      duplicate_customer_count: duplicateCustomerCount,
      ignored_group_count: ignoredCount,
      groups,
    });
  } catch (err) {
    console.error('[Customer Duplicates] Scan error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { action?: string; contact_ids?: string[]; keep_contact_id?: string; confirmation?: string };
    const requestedIds = [...new Set((body.contact_ids || []).map(String))].sort();
    if (requestedIds.length < 2) return NextResponse.json({ success: false, error: 'Select a duplicate group containing at least two customers.' }, { status: 400 });

    // Never trust IDs sent by the browser: confirm the exact group still exists in a fresh Zoho scan.
    const { groups } = await scanDuplicates(true);
    const fingerprint = duplicateGroupFingerprint(requestedIds);
    const group = groups.find(candidate => duplicateGroupFingerprint(candidate.customers.map(customer => customer.contact_id)) === fingerprint);
    if (!group) return NextResponse.json({ success: false, error: 'This duplicate group changed or is no longer detected. Refresh and review it again.' }, { status: 409 });

    if (body.action === 'ignore') {
      await ignoreDuplicateGroup(group.customers, group.reasons);
      return NextResponse.json({ success: true, action: 'ignored', group_fingerprint: fingerprint });
    }

    if (body.action === 'merge') {
      const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
      if (role !== 'director') return NextResponse.json({ success: false, error: 'Only the Director account can merge and remove Zoho customer records.' }, { status: 403 });
      const keepId = String(body.keep_contact_id || '');
      const keep = group.customers.find(customer => customer.contact_id === keepId);
      if (!keep) return NextResponse.json({ success: false, error: 'Choose which customer Zoho should keep.' }, { status: 400 });
      if (body.confirmation !== `MERGE ${keepId}`) return NextResponse.json({ success: false, error: 'Merge confirmation did not match.' }, { status: 400 });
      await zohoPost(`/contacts/${keepId}/merge`);
      return NextResponse.json({ success: true, action: 'merged', kept_contact_id: keepId, kept_customer_name: keep.company_name || keep.contact_name });
    }

    return NextResponse.json({ success: false, error: 'Unsupported duplicate action.' }, { status: 400 });
  } catch (error) {
    console.error('[Customer Duplicates] Action failed:', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
