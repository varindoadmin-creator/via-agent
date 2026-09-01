// ─── Customer → Salesperson auto-assignment ────────────────────────────────
// Learns which salesperson each customer belongs to from Sales Orders and
// Invoices that already have one set, then fills in the blanks on documents
// that don't. Two modes:
//   - 'incremental': small recent window (last few days), used by the daily
//     09:00 Asia/Jakarta cron (app/api/salesperson-map/sync/route.ts) and the
//     Dashboard "Run Salesperson Sync Now" button.
//   - 'backfill': full history, no date filter — a one-time run to both seed
//     the database and retroactively fix existing gaps.
// Conflicting history (a customer seen with more than one salesperson) is
// resolved by most-frequent-wins (ties broken by most recent).

import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { enqueueJob } from '@/lib/jobs/queue';

const MAP_TABLE = 'customer_salesperson_map';
const LOG_TABLE = 'salesperson_auto_assign_log';
const INCREMENTAL_DAYS_BACK = 3;
const BACKFILL_PAGE_CAP = 100; // 200/page → up to 20,000 documents per doc type
const INCREMENTAL_PAGE_CAP = 20;
const CONCURRENCY = 5;

// ─── Supabase helpers (fetch-based REST, same convention as every other route) ──

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  return { url: url.replace(/\/$/, ''), key };
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  if (res.status === 204) return [];
  return res.json();
}

// ─── Zoho helpers ───────────────────────────────────────────────────────────

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchWithRetry(`${base}${path}${sep}organization_id=${orgId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal: controller.signal,
    });
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
  const res = await fetchWithRetry(`${base}${path}?organization_id=${orgId}`, {
    method: 'PUT',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

/** Runs `fn` over `items` with bounded concurrency (Zoho + Supabase are both rate-limited). */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─── Salesperson roster (org-wide list; SO list responses omit salesperson_id) ──

interface RosterEntry { salesperson_id: string; salesperson_name: string; }

async function getSalespersonRoster(): Promise<Map<string, string>> {
  const roster = new Map<string, string>(); // name -> id
  const data = await zohoGet('/salespersons');
  const list = (data.salespersons || []) as RosterEntry[];
  for (const sp of list) {
    if (sp.salesperson_name) roster.set(sp.salesperson_name, sp.salesperson_id);
  }
  return roster;
}

// ─── Sales Orders / Invoices fetch ──────────────────────────────────────────

interface DocRecord {
  document_type: 'sales_order' | 'invoice';
  document_id: string;
  document_number: string;
  customer_id: string;
  customer_name: string;
  salesperson_name: string;
  salesperson_id: string; // populated for invoices; blank for SOs until resolved via roster
  status: string;
}

async function fetchDocs(kind: 'sales_order' | 'invoice', dateFrom: string | null): Promise<DocRecord[]> {
  const endpoint = kind === 'sales_order' ? 'salesorders' : 'invoices';
  const idField = kind === 'sales_order' ? 'salesorder_id' : 'invoice_id';
  const numberField = kind === 'sales_order' ? 'salesorder_number' : 'invoice_number';

  const docs: DocRecord[] = [];
  let page = 1;
  let hasMore = true;
  const cap = dateFrom ? INCREMENTAL_PAGE_CAP : BACKFILL_PAGE_CAP;
  while (hasMore) {
    let path = `/${endpoint}?per_page=200&page=${page}&sort_column=date&sort_order=D`;
    if (dateFrom) path += `&date_start=${dateFrom}`;
    const data = await zohoGet(path);
    const batch = (data[endpoint] || []) as Record<string, unknown>[];
    for (const d of batch) {
      docs.push({
        document_type: kind,
        document_id: String(d[idField] || ''),
        document_number: String(d[numberField] || ''),
        customer_id: String(d.customer_id || ''),
        customer_name: String(d.customer_name || ''),
        salesperson_name: String(d.salesperson_name || ''),
        salesperson_id: String(d.salesperson_id || ''),
        status: String(d.status || ''),
      });
    }
    hasMore = batch.length === 200;
    page++;
    if (page > cap) break;
  }
  return docs;
}

// ─── Learn: upsert (customer_id, salesperson_id) pairs seen on documents ──────

async function upsertMapping(customerId: string, customerName: string, salespersonId: string, salespersonName: string) {
  const existing = await supabaseRequest(
    `${MAP_TABLE}?customer_id=eq.${encodeURIComponent(customerId)}&salesperson_id=eq.${encodeURIComponent(salespersonId)}&select=times_seen`
  );
  const timesSeen = Array.isArray(existing) && existing[0]
    ? (Number((existing[0] as Record<string, unknown>).times_seen) || 0) + 1
    : 1;
  await supabaseRequest(`${MAP_TABLE}?on_conflict=customer_id,salesperson_id`, {
    method: 'POST',
    body: JSON.stringify([{
      customer_id: customerId,
      customer_name: customerName,
      salesperson_id: salespersonId,
      salesperson_name: salespersonName,
      times_seen: timesSeen,
      last_seen_at: new Date().toISOString(),
    }]),
  });
}

interface BestMatch { salesperson_id: string; salesperson_name: string; }

/** Reduces the (customer, salesperson) history to one current pick per customer — most times_seen wins, ties broken by most recent. */
async function loadBestSalespersonPerCustomer(): Promise<Map<string, BestMatch>> {
  const data = await supabaseRequest(`${MAP_TABLE}?select=customer_id,salesperson_id,salesperson_name,times_seen,last_seen_at`);
  const best = new Map<string, BestMatch & { times_seen: number; last_seen_at: string }>();
  if (!Array.isArray(data)) return new Map();
  for (const r of data as Record<string, unknown>[]) {
    const customerId = String(r.customer_id || '');
    if (!customerId) continue;
    const timesSeen = Number(r.times_seen) || 0;
    const lastSeenAt = String(r.last_seen_at || '');
    const existing = best.get(customerId);
    if (!existing || timesSeen > existing.times_seen || (timesSeen === existing.times_seen && lastSeenAt > existing.last_seen_at)) {
      best.set(customerId, {
        salesperson_id: String(r.salesperson_id || ''),
        salesperson_name: String(r.salesperson_name || ''),
        times_seen: timesSeen,
        last_seen_at: lastSeenAt,
      });
    }
  }
  const result = new Map<string, BestMatch>();
  for (const [k, v] of best) result.set(k, { salesperson_id: v.salesperson_id, salesperson_name: v.salesperson_name });
  return result;
}

async function logAssignResults(rows: LogRow[]) {
  if (!rows.length) return;
  try {
    await supabaseRequest(LOG_TABLE, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
  } catch (err) {
    // Logging failure shouldn't mask a successful Zoho write — same soft-fail
    // convention as invoice_auto_send_log's logAutoSendResults().
    console.error('[SalespersonSync] Logging to Supabase failed:', err);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface SyncOptions {
  mode?: 'incremental' | 'backfill';
  dryRun?: boolean;
}

interface LogRow {
  document_type: 'sales_order' | 'invoice';
  document_id: string;
  document_number: string;
  customer_id: string;
  customer_name: string;
  salesperson_id: string;
  salesperson_name: string;
  success: boolean;
  error: string | null;
}

export interface SyncResultRow extends Omit<LogRow, 'error'> {
  error?: string;
}

export interface SyncResult {
  mode: 'incremental' | 'backfill';
  dryRun: boolean;
  learned: number;
  assigned: number;
  skipped: number;
  failed: number;
  results: SyncResultRow[];
}

/** Retries exactly one document's salesperson-assignment PUT — the job handler for the `salesperson_assign_retry` background job (see app/api/jobs/sweep/route.ts). Throws on failure so the job queue's own retry/backoff/DLQ logic governs it. */
export async function retrySalespersonAssignment(payload: { documentType: 'sales_order' | 'invoice'; documentId: string; salespersonId: string; salespersonName: string }): Promise<void> {
  const endpoint = payload.documentType === 'sales_order' ? 'salesorders' : 'invoices';
  await zohoPut(`/${endpoint}/${payload.documentId}`, { salesperson_id: payload.salespersonId });
  await logAssignResults([{
    document_type: payload.documentType, document_id: payload.documentId, document_number: payload.documentId,
    customer_id: '', customer_name: '', salesperson_id: payload.salespersonId, salesperson_name: payload.salespersonName,
    success: true, error: null,
  }]);
}

export async function runSalespersonSync(options: SyncOptions = {}): Promise<SyncResult> {
  const mode = options.mode || 'incremental';
  const dryRun = Boolean(options.dryRun);

  await getZohoAccessToken();
  const roster = await getSalespersonRoster();

  const dateFrom = mode === 'incremental'
    ? new Date(Date.now() - INCREMENTAL_DAYS_BACK * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    : null;

  const [soDocs, invDocs] = await Promise.all([
    fetchDocs('sales_order', dateFrom),
    fetchDocs('invoice', dateFrom),
  ]);
  const allDocs = [...soDocs, ...invDocs].filter(d => d.status !== 'void' && d.customer_id);

  // Learn pass — record (customer, salesperson) pairs from documents that already have one.
  const learnable = allDocs.filter(d => d.salesperson_name);
  let learned = 0;
  await mapWithConcurrency(learnable, CONCURRENCY, async doc => {
    const salespersonId = doc.salesperson_id || roster.get(doc.salesperson_name) || '';
    if (!salespersonId) return; // unresolved name (typo/deactivated salesperson) — skip silently
    try {
      await upsertMapping(doc.customer_id, doc.customer_name, salespersonId, doc.salesperson_name);
      learned++;
    } catch (err) {
      console.error('[SalespersonSync] Learn upsert failed:', err);
    }
  });

  // Apply pass — fill in documents with no salesperson, using the freshly-learned map.
  const bestMap = await loadBestSalespersonPerCustomer();
  const applicable = allDocs.filter(d => !d.salesperson_name && bestMap.has(d.customer_id));
  const skipped = allDocs.filter(d => !d.salesperson_name && !bestMap.has(d.customer_id)).length;

  let assigned = 0;
  let failed = 0;
  const results = await mapWithConcurrency(applicable, CONCURRENCY, async (doc): Promise<SyncResultRow> => {
    const best = bestMap.get(doc.customer_id)!;
    const base: SyncResultRow = {
      document_type: doc.document_type,
      document_id: doc.document_id,
      document_number: doc.document_number,
      customer_id: doc.customer_id,
      customer_name: doc.customer_name,
      salesperson_id: best.salesperson_id,
      salesperson_name: best.salesperson_name,
      success: true,
    };
    if (dryRun) {
      assigned++;
      return base;
    }
    try {
      const endpoint = doc.document_type === 'sales_order' ? 'salesorders' : 'invoices';
      await zohoPut(`/${endpoint}/${doc.document_id}`, { salesperson_id: best.salesperson_id });
      assigned++;
      return base;
    } catch (err) {
      failed++;
      // Phase 13, brief sections 6/9/35: a single-document PUT failure no
      // longer just gets logged and forgotten — it durably retries via the
      // background job queue (app/api/jobs/sweep), bounded by that queue's
      // own attempt/backoff policy, and surfaces in the DLQ if it keeps failing.
      await enqueueJob({
        jobType: 'salesperson_assign_retry',
        payload: { documentType: doc.document_type, documentId: doc.document_id, salespersonId: best.salesperson_id, salespersonName: best.salesperson_name },
        idempotencyKey: `salesperson_assign:${doc.document_type}:${doc.document_id}:${best.salesperson_id}`,
      }).catch(queueErr => console.error('[SalespersonSync] Failed to enqueue retry job:', queueErr));
      return { ...base, success: false, error: String(err) };
    }
  });

  if (!dryRun) {
    await logAssignResults(results.map(r => ({
      document_type: r.document_type,
      document_id: r.document_id,
      document_number: r.document_number,
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      salesperson_id: r.salesperson_id,
      salesperson_name: r.salesperson_name,
      success: r.success,
      error: r.error || null,
    })));
  }

  return { mode, dryRun, learned, assigned, skipped, failed, results };
}
