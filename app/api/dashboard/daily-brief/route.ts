import { NextResponse } from 'next/server';

// ─── Daily Brief: what VIA did automatically, grouped by day ──────────────────
// Reads three logs the daily 09:00 Asia/Jakarta scheduled jobs write to:
//   - customer_cleanup_log (lib/customerCleanup/autoRepair.ts) — rows with an
//     empty `changes` array mean "scanned, nothing needed fixing" and are
//     excluded, since the brief is specifically about things that changed.
//   - shipment_invoice_log (lib/shipments/autoInvoice.ts) — only success=true
//     rows are shown; failed conversion attempts are logged but not surfaced
//     here (they just get retried automatically the next day).
//   - invoice_auto_send_log (app/api/invoices-page/auto-send/route.ts) — same
//     success=true-only rule; skipped (insufficient stock) and failed sends
//     are logged but not shown here, since they just retry the next run.

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta is a fixed UTC+7, no DST.
const DAYS_BACK = 14;

interface CustomerLogRow {
  contact_id: string;
  contact_name: string;
  changes: Array<{ field: string; from: string; to: string }>;
  fixed_at: string;
}

interface InvoiceLogRow {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  invoice_number: string | null;
  converted_at: string;
}

interface SentInvoiceLogRow {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  sent_at: string;
}

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function sbUrl(path: string) {
  return `${(process.env.SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/${path}`;
}

/** Jakarta calendar date (YYYY-MM-DD) for a UTC timestamp. */
function jakartaDate(isoStr: string): string {
  const shifted = new Date(new Date(isoStr).getTime() + JAKARTA_OFFSET_MS);
  return shifted.toISOString().split('T')[0];
}

function dayLabel(date: string, today: string, yesterday: string): string {
  if (date === today) return 'Today';
  if (date === yesterday) return 'Yesterday';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function GET() {
  try {
    const cutoff = new Date(Date.now() - DAYS_BACK * 24 * 60 * 60 * 1000).toISOString();

    const [customerRes, invoiceRes, sentInvoiceRes] = await Promise.all([
      fetch(sbUrl(`customer_cleanup_log?select=contact_id,contact_name,changes,fixed_at&fixed_at=gte.${cutoff}&order=fixed_at.desc&limit=500`), { headers: sbHeaders() }),
      fetch(sbUrl(`shipment_invoice_log?select=salesorder_id,salesorder_number,customer_name,invoice_number,converted_at&success=eq.true&converted_at=gte.${cutoff}&order=converted_at.desc&limit=500`), { headers: sbHeaders() }),
      fetch(sbUrl(`invoice_auto_send_log?select=invoice_id,invoice_number,customer_name,sent_at&success=eq.true&sent_at=gte.${cutoff}&order=sent_at.desc&limit=500`), { headers: sbHeaders() }),
    ]);

    if (!customerRes.ok) throw new Error(`Supabase ${customerRes.status}: ${await customerRes.text()}`);
    const customerRows = (await customerRes.json()) as CustomerLogRow[];
    const repaired = customerRows.filter(r => Array.isArray(r.changes) && r.changes.length > 0);

    // shipment_invoice_log / invoice_auto_send_log may not exist yet if their SQL
    // migration hasn't been run — soft-fail to an empty list rather than breaking
    // the whole Daily Brief.
    const invoiceRows: InvoiceLogRow[] = invoiceRes.ok ? await invoiceRes.json() : [];
    const sentInvoiceRows: SentInvoiceLogRow[] = sentInvoiceRes.ok ? await sentInvoiceRes.json() : [];

    const nowJakarta = new Date(Date.now() + JAKARTA_OFFSET_MS).toISOString().split('T')[0];
    const yesterdayJakarta = new Date(Date.now() + JAKARTA_OFFSET_MS - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const customersByDate = new Map<string, CustomerLogRow[]>();
    for (const row of repaired) {
      const date = jakartaDate(row.fixed_at);
      const list = customersByDate.get(date);
      if (list) list.push(row);
      else customersByDate.set(date, [row]);
    }

    const invoicesByDate = new Map<string, InvoiceLogRow[]>();
    for (const row of invoiceRows) {
      const date = jakartaDate(row.converted_at);
      const list = invoicesByDate.get(date);
      if (list) list.push(row);
      else invoicesByDate.set(date, [row]);
    }

    const sentInvoicesByDate = new Map<string, SentInvoiceLogRow[]>();
    for (const row of sentInvoiceRows) {
      const date = jakartaDate(row.sent_at);
      const list = sentInvoicesByDate.get(date);
      if (list) list.push(row);
      else sentInvoicesByDate.set(date, [row]);
    }

    const allDates = new Set([...customersByDate.keys(), ...invoicesByDate.keys(), ...sentInvoicesByDate.keys()]);

    const days = Array.from(allDates)
      .sort((a, b) => b.localeCompare(a))
      .map(date => ({
        date,
        label: dayLabel(date, nowJakarta, yesterdayJakarta),
        customers: (customersByDate.get(date) || []).map(c => ({
          contact_id: c.contact_id,
          contact_name: c.contact_name,
          changes: c.changes,
          fixed_at: c.fixed_at,
        })),
        invoices: (invoicesByDate.get(date) || []).map(i => ({
          salesorder_id: i.salesorder_id,
          salesorder_number: i.salesorder_number,
          customer_name: i.customer_name,
          invoice_number: i.invoice_number,
          converted_at: i.converted_at,
        })),
        sentInvoices: (sentInvoicesByDate.get(date) || []).map(i => ({
          invoice_id: i.invoice_id,
          invoice_number: i.invoice_number,
          customer_name: i.customer_name,
          sent_at: i.sent_at,
        })),
      }));

    return NextResponse.json({ success: true, days });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
