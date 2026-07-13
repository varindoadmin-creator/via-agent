// ─── Automated repair for new customers ────────────────────────────────────
// Runs daily (see instrumentation.ts) — scans customers created in the last 7
// days and applies the same fix logic as the manual "Repair Data" flow
// (app/api/customers/cleanup/route.ts), but with no human review step: any
// computable fix is written straight to Zoho. Anything computeCustomerFix
// can't resolve (flags, e.g. an unrecognized province) is left untouched,
// same safety behavior as the manual flow.

import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { computeCustomerFix, RawContact } from './rules';
import { getFixedContactIds, logCustomerFixed } from './supabaseLog';

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

async function fetchNewCustomerIds(): Promise<string[]> {
  const now = new Date();
  const day7ago = new Date(now);
  day7ago.setDate(now.getDate() - 7);
  const cutoff = day7ago.toISOString().split('T')[0];

  const ids: string[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const res = await zohoGet(`/contacts?contact_type=customer&status=active&sort_column=created_time&sort_order=D&per_page=200&page=${page}`);
    const batch = (res.contacts || []) as Record<string, unknown>[];
    for (const c of batch) {
      const createdDate = String(c.created_time || '').split('T')[0];
      if (createdDate && createdDate >= cutoff) ids.push(String(c.contact_id));
    }
    // List is sorted newest-first — once a page's oldest entry is before the cutoff, stop paging.
    const oldestInBatch = batch.length ? String(batch[batch.length - 1].created_time || '').split('T')[0] : '';
    hasMore = Boolean(res.page_context?.has_more_page) && (!oldestInBatch || oldestInBatch >= cutoff);
    page++;
    if (page > 20) break;
  }
  return ids;
}

async function fetchContactDetail(id: string): Promise<RawContact | null> {
  try {
    const res = await zohoGet(`/contacts/${id}`);
    return (res.contact as RawContact) || null;
  } catch {
    return null;
  }
}

export interface AutoRepairResult {
  scanned: number;
  fixed: number;
  no_change_needed: number;
  failed: Array<{ contact_id: string; error: string }>;
}

export async function runAutoRepairForNewCustomers(): Promise<AutoRepairResult> {
  const [newIds, fixedIds] = await Promise.all([fetchNewCustomerIds(), getFixedContactIds()]);
  const unprocessed = newIds.filter(id => !fixedIds.has(id));

  const result: AutoRepairResult = { scanned: unprocessed.length, fixed: 0, no_change_needed: 0, failed: [] };

  const BATCH = 10;
  for (let i = 0; i < unprocessed.length; i += BATCH) {
    const slice = unprocessed.slice(i, i + BATCH);
    await Promise.all(slice.map(async id => {
      try {
        const contact = await fetchContactDetail(id);
        if (!contact) { result.failed.push({ contact_id: id, error: 'Customer not found in Zoho.' }); return; }

        const fix = computeCustomerFix(contact);
        const hasChanges = Object.keys(fix.payload).length > 0;
        if (hasChanges) {
          await zohoPut(`/contacts/${id}`, fix.payload);
          result.fixed++;
        } else {
          result.no_change_needed++;
        }

        await logCustomerFixed(id, contact.contact_name || contact.company_name || '(unnamed)', fix.changes);
      } catch (err) {
        result.failed.push({ contact_id: id, error: err instanceof Error ? err.message : String(err) });
      }
    }));
  }

  console.log('[AutoRepair] Daily run complete:', result);
  return result;
}
