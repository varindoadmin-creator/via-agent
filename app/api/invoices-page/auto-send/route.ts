import { NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';
import { fetchWithRetry } from '@/lib/zoho/retry';
import { recordCronRun } from '@/lib/cron/runLog';

export const maxDuration = 300;

// Triggered daily at 09:00 Asia/Jakarta by an external cron-job.org scheduled
// job (see middleware.ts for the x-cron-secret auth bypass — Hostinger's
// Node.js Web App hosting has no cron support of its own). Also callable
// manually via the "Mark Ready Drafts as Sent" Daily Brief action button.
const LOG_TABLE = 'invoice_auto_send_log';

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  return { url: url.replace(/\/$/, ''), key };
}

interface AutoSendLogRow {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  success: boolean;
  skipped: boolean;
  reason: string | null;
  error: string | null;
}

async function logAutoSendResults(rows: AutoSendLogRow[]) {
  if (!rows.length) return;
  const { url, key } = supabaseConfig();
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/rest/v1/${LOG_TABLE}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  } catch (err) {
    // Logging failure shouldn't mask a successful Zoho operation — same
    // soft-fail behavior as lib/shipments/autoInvoice.ts's Supabase log.
    console.error('[AutoSendInvoices] Logging to Supabase failed:', err);
  }
}

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchWithRetry(`${base}${path}${sep}organization_id=${orgId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal: controller.signal,
    });
    const body = await res.json();
    if (!res.ok || (body.code !== undefined && body.code !== 0)) {
      throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    await getZohoAccessToken();

    // Fetch all draft invoices
    const draftData = await zohoGet('/invoices?status=draft&per_page=200');
    const drafts = draftData.invoices || [];

    const results: Array<{ invoice_id: string; invoice_number: string; customer_name: string; success: boolean; skipped?: boolean; reason?: string; error?: string }> = [];

    for (const inv of drafts) {
      const invoiceId = String(inv.invoice_id);
      const customerName = String(inv.customer_name || '');
      try {
        // Fetch detail to check stock per location
        const detail = await zohoGet('/invoices/' + inv.invoice_id);
        const lineItems = detail.invoice?.line_items || [];

        // Check per-location stock for each item
        const itemIds = [...new Set(lineItems.map((li: Record<string, unknown>) => String(li.item_id || '')).filter(Boolean))];
        const itemLocMap = new Map<string, number>();

        await Promise.all(itemIds.map(async (itemId: string) => {
          try {
            const itemDetail = await zohoGet('/items/' + itemId);
            for (const loc of itemDetail.item?.locations || []) {
              itemLocMap.set(itemId + '_' + String(loc.location_id), Number(loc.location_stock_on_hand) || 0);
            }
          } catch { /* skip */ }
        }));

        // Check all items are ready
        const allReady = lineItems.every((li: Record<string, unknown>) => {
          const qty = Number(li.quantity) || 0;
          const key = String(li.item_id) + '_' + String(li.location_id);
          const stock = itemLocMap.get(key) ?? Number(li.stock_on_hand) ?? 0;
          return stock >= qty;
        });

        if (!allReady) {
          results.push({ invoice_id: invoiceId, invoice_number: String(inv.invoice_number), customer_name: customerName, success: false, skipped: true, reason: 'Insufficient stock' });
          continue;
        }

        // Mark as sent
        const token = await getZohoAccessToken();
        const base = getZohoApiBaseUrl();
        const orgId = getZohoOrgId();
        const res = await fetchWithRetry(`${base}/invoices/${inv.invoice_id}/status/sent?organization_id=${orgId}`, {
          method: 'POST',
          headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const resData = await res.json();
        if (!res.ok && resData.code !== 0) throw new Error(resData.message || 'Failed');
        results.push({ invoice_id: invoiceId, invoice_number: String(inv.invoice_number), customer_name: customerName, success: true });

      } catch (e) {
        results.push({ invoice_id: invoiceId, invoice_number: String(inv.invoice_number), customer_name: customerName, success: false, error: String(e) });
      }
    }

    const sent = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;

    await logAutoSendResults(results.map(r => ({
      invoice_id: r.invoice_id,
      invoice_number: r.invoice_number,
      customer_name: r.customer_name,
      success: r.success,
      skipped: r.skipped || false,
      reason: r.reason || null,
      error: r.error || null,
    })));

    await recordCronRun('invoices-auto-send', 'success', startedAt, {
      drafts: drafts.length,
      sent,
      skipped,
      failed,
    });
    return NextResponse.json({ success: true, sent, skipped, failed, results });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordCronRun('invoices-auto-send', 'failed', startedAt, {}, error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}
