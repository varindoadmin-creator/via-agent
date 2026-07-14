// ─── Automated conversion for fully-delivered Sales Orders ─────────────────
// Runs daily (see instrumentation.ts) alongside the customer auto-repair job.
// Reuses the exact same GET/POST logic the manual "Convert to Invoice" button
// on the Shipment Delivered — Not Invoiced table calls (app/api/shipments/route.ts),
// invoked in-process rather than over HTTP. Only SOs where every line item is
// fully delivered (all_delivered — the same flag that shows "Ready" in the UI)
// are converted; partial deliveries are left for a human to review.

import { NextRequest } from 'next/server';
import { GET, POST, type DeliveredNotInvoiced } from '@/app/api/shipments/route';

const TABLE = 'shipment_invoice_log';

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
      Prefer: 'return=minimal',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? [] : res.json();
}

export interface AutoInvoiceLogRow {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  success: boolean;
  invoice_number?: string;
  error?: string;
}

async function logShipmentInvoices(rows: AutoInvoiceLogRow[]) {
  if (!rows.length) return;
  await supabaseRequest(`${TABLE}`, {
    method: 'POST',
    body: JSON.stringify(rows.map(r => ({
      salesorder_id: r.salesorder_id,
      salesorder_number: r.salesorder_number,
      customer_name: r.customer_name,
      invoice_number: r.invoice_number || null,
      success: r.success,
      error: r.error || null,
      converted_at: new Date().toISOString(),
    }))),
  });
}

export interface AutoInvoiceResult {
  scanned: number;
  converted: number;
  failed: number;
  results: AutoInvoiceLogRow[];
}

export async function runAutoConvertReadyShipments(): Promise<AutoInvoiceResult> {
  const getRes = await GET(new NextRequest('http://localhost/api/shipments?mode=delivered'));
  const getData = await getRes.json();
  const delivered = (getData.delivered || []) as DeliveredNotInvoiced[];
  const ready = delivered.filter(d => d.all_delivered);

  if (ready.length === 0) {
    return { scanned: 0, converted: 0, failed: 0, results: [] };
  }

  const postRes = await POST(new NextRequest('http://localhost/api/shipments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ salesorder_ids: ready.map(r => r.salesorder_id) }),
  }));
  const postData = await postRes.json();
  const conversions = (postData.results || []) as Array<{
    salesorder_id: string; salesorder_number: string;
    success: boolean; invoice_number?: string; error?: string;
  }>;

  const nameById = new Map(ready.map(r => [r.salesorder_id, r.customer_name]));
  const results: AutoInvoiceLogRow[] = conversions.map(c => ({
    salesorder_id: c.salesorder_id,
    salesorder_number: c.salesorder_number,
    customer_name: nameById.get(c.salesorder_id) || '',
    success: c.success,
    invoice_number: c.invoice_number,
    error: c.error,
  }));

  try {
    await logShipmentInvoices(results);
  } catch (err) {
    // Conversions already happened in Zoho at this point — a missing/misconfigured
    // shipment_invoice_log table shouldn't be reported as a failed run.
    console.error('[AutoInvoice] Logging to Supabase failed (conversions still succeeded):', err);
  }

  console.log('[AutoInvoice] Daily run complete:', {
    scanned: ready.length,
    converted: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  });

  return {
    scanned: ready.length,
    converted: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };
}
