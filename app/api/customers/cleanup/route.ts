import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { computeCustomerFix, RawContact } from '@/lib/customerCleanup/rules';
import { logCustomerFixed } from '@/lib/customerCleanup/supabaseLog';

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

async function zohoPut(path: string, data: Record<string, unknown>) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const url = `${base}${path}?organization_id=${orgId}`;
  const res = await fetchWithRetry(url, {
    method: 'PUT',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function fetchAllCustomerIds(): Promise<Array<{ contact_id: string; contact_name: string }>> {
  const items: Array<{ contact_id: string; contact_name: string }> = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await zohoGet(`/contacts?contact_type=customer&per_page=200&page=${page}`);
    const batch = (res.contacts || []) as Array<{ contact_id: string; contact_name: string }>;
    items.push(...batch);
    hasMore = Boolean(res.page_context?.has_more_page);
    page++;
    if (page > 20) break;
  }
  return items;
}

async function fetchContactDetail(id: string): Promise<RawContact | null> {
  try {
    const res = await zohoGet(`/contacts/${id}`);
    return (res.contact as RawContact) || null;
  } catch {
    return null;
  }
}

async function fetchDetailBatch(ids: string[]): Promise<RawContact[]> {
  const BATCH = 15;
  const results: RawContact[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const details = await Promise.all(slice.map(fetchContactDetail));
    results.push(...(details.filter(Boolean) as RawContact[]));
  }
  return results;
}

// ─── GET /api/customers/cleanup — scan for customers needing fixes ───────────

export async function GET() {
  try {
    // Re-scan every customer. A contact that passed an earlier cleanup may
    // need a rule introduced later (such as correcting ". PT" to ", PT").
    // computeCustomerFix only returns current differences, so already-clean
    // customers remain absent from the review list.
    const allCustomers = await fetchAllCustomerIds();
    const details = await fetchDetailBatch(allCustomers.map((c) => c.contact_id));

    const results = details
      .map((contact) => {
        const fix = computeCustomerFix(contact);
        return {
          contact_id: contact.contact_id,
          contact_name: contact.contact_name || contact.company_name || '(unnamed)',
          changes: fix.changes,
          flags: fix.flags,
        };
      })
      .filter((r) => r.changes.length > 0 || r.flags.length > 0);

    return NextResponse.json({
      success: true,
      total_customers: allCustomers.length,
      already_fixed: 0,
      scanned: allCustomers.length,
      needs_attention: results.length,
      customers: results,
    });
  } catch (err) {
    console.error('[Customer Cleanup] Scan error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ─── POST /api/customers/cleanup — apply fixes for selected contact_ids ──────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const contactIds: string[] = Array.isArray(body?.contact_ids) ? body.contact_ids : [];
    if (!contactIds.length) {
      return NextResponse.json({ error: 'contact_ids is required' }, { status: 400 });
    }

    const succeeded: Array<{ contact_id: string; contact_name: string; changes: unknown[] }> = [];
    const failed: Array<{ contact_id: string; error: string }> = [];

    for (const id of contactIds) {
      try {
        const contact = await fetchContactDetail(id);
        if (!contact) {
          failed.push({ contact_id: id, error: 'Customer not found in Zoho (may have been deleted).' });
          continue;
        }

        const fix = computeCustomerFix(contact);

        if (Object.keys(fix.payload).length > 0) {
          await zohoPut(`/contacts/${id}`, fix.payload);
        }

        await logCustomerFixed(
          id,
          contact.contact_name || contact.company_name || '(unnamed)',
          fix.changes
        );

        succeeded.push({
          contact_id: id,
          contact_name: contact.contact_name || contact.company_name || '(unnamed)',
          changes: fix.changes,
        });
      } catch (err) {
        failed.push({ contact_id: id, error: String(err) });
      }
    }

    return NextResponse.json({ success: true, succeeded, failed });
  } catch (err) {
    console.error('[Customer Cleanup] Apply error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
