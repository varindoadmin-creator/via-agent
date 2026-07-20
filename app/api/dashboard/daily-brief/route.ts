import { NextResponse } from 'next/server';

// ─── Daily Brief: what VIA did automatically, grouped by day ──────────────────
// Reads four logs the daily 09:00 Asia/Jakarta scheduled jobs write to:
//   - customer_cleanup_log (lib/customerCleanup/autoRepair.ts) — rows with an
//     empty `changes` array mean "scanned, nothing needed fixing" and are
//     excluded, since the brief is specifically about things that changed.
//   - shipment_invoice_log (lib/shipments/autoInvoice.ts) — only success=true
//     rows are shown; failed conversion attempts are logged but not surfaced
//     here (they just get retried automatically the next day).
//   - invoice_auto_send_log (app/api/invoices-page/auto-send/route.ts) — same
//     success=true-only rule; skipped (insufficient stock) and failed sends
//     are logged but not shown here, since they just retry the next run.
//   - price_list_sync_log (lib/zoho/priceListSync.ts) — only real
//     (dry_run=false) action='added' rows; skipped rows (no reference prefix,
//     or an inconsistent one) need a human to price the item, not a Daily
//     Brief mention. Rows come in one-per-tier, so they're merged here into
//     one entry per item with the list of tiers it was added to.
//   - salesperson_auto_assign_log (lib/salespersonMap/sync.ts) — only
//     success=true rows are shown; failed assignments are logged but not
//     surfaced here (they just get retried automatically the next run).
//
// Plus two logs written live at approval time (not by a scheduled job) —
// admin approves Sales Orders/Purchase Orders throughout the day, and the
// Director wants to see that activity each morning without a separate cron:
//   - so_approval_log (app/api/approvals/so/route.ts)
//   - po_approval_log (lib/zoho/poApprovalEngine.ts) — only the for_stock/
//     excess_stock line items are recorded per PO, not every line.

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

interface PriceListSyncLogRow {
  item_id: string;
  item_name: string;
  tier: string;
  discount_applied: string | null;
  created_at: string;
}

interface SalespersonAssignLogRow {
  document_type: 'sales_order' | 'invoice';
  document_id: string;
  document_number: string;
  customer_name: string;
  salesperson_name: string;
  assigned_at: string;
}

interface SOApprovalLogRow {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  total: number;
  item_count: number;
  approved_by: string;
  approved_at: string;
}

interface POStockItem {
  item_name: string;
  sku: string;
  quantity: number;
  stock_qty: number;
  match_status: 'for_stock' | 'excess_stock';
  location_name: string;
}

interface POApprovalLogRow {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  total: number;
  stock_items: POStockItem[];
  approved_by: string;
  approved_at: string;
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

    const [customerRes, invoiceRes, sentInvoiceRes, priceListRes, salespersonRes, soApprovalRes, poApprovalRes] = await Promise.all([
      fetch(sbUrl(`customer_cleanup_log?select=contact_id,contact_name,changes,fixed_at&fixed_at=gte.${cutoff}&order=fixed_at.desc&limit=500`), { headers: sbHeaders() }),
      fetch(sbUrl(`shipment_invoice_log?select=salesorder_id,salesorder_number,customer_name,invoice_number,converted_at&success=eq.true&converted_at=gte.${cutoff}&order=converted_at.desc&limit=500`), { headers: sbHeaders() }),
      fetch(sbUrl(`invoice_auto_send_log?select=invoice_id,invoice_number,customer_name,sent_at&success=eq.true&sent_at=gte.${cutoff}&order=sent_at.desc&limit=500`), { headers: sbHeaders() }),
      fetch(sbUrl(`price_list_sync_log?select=item_id,item_name,tier,discount_applied,created_at&action=eq.added&dry_run=eq.false&created_at=gte.${cutoff}&order=created_at.desc&limit=1000`), { headers: sbHeaders() }),
      fetch(sbUrl(`salesperson_auto_assign_log?select=document_type,document_id,document_number,customer_name,salesperson_name,assigned_at&success=eq.true&assigned_at=gte.${cutoff}&order=assigned_at.desc&limit=500`), { headers: sbHeaders() }),
      fetch(sbUrl(`so_approval_log?select=salesorder_id,salesorder_number,customer_name,total,item_count,approved_by,approved_at&approved_at=gte.${cutoff}&order=approved_at.desc&limit=500`), { headers: sbHeaders() }),
      fetch(sbUrl(`po_approval_log?select=purchaseorder_id,purchaseorder_number,vendor_name,total,stock_items,approved_by,approved_at&approved_at=gte.${cutoff}&order=approved_at.desc&limit=500`), { headers: sbHeaders() }),
    ]);

    if (!customerRes.ok) throw new Error(`Supabase ${customerRes.status}: ${await customerRes.text()}`);
    const customerRows = (await customerRes.json()) as CustomerLogRow[];
    const repaired = customerRows.filter(r => Array.isArray(r.changes) && r.changes.length > 0);

    // shipment_invoice_log / invoice_auto_send_log / price_list_sync_log /
    // salesperson_auto_assign_log / so_approval_log / po_approval_log may not
    // exist yet if their SQL migration hasn't been run — soft-fail to an
    // empty list rather than breaking the whole Daily Brief.
    const invoiceRows: InvoiceLogRow[] = invoiceRes.ok ? await invoiceRes.json() : [];
    const sentInvoiceRows: SentInvoiceLogRow[] = sentInvoiceRes.ok ? await sentInvoiceRes.json() : [];
    const priceListRows: PriceListSyncLogRow[] = priceListRes.ok ? await priceListRes.json() : [];
    const salespersonRows: SalespersonAssignLogRow[] = salespersonRes.ok ? await salespersonRes.json() : [];
    const soApprovalRows: SOApprovalLogRow[] = soApprovalRes.ok ? await soApprovalRes.json() : [];
    const poApprovalRows: POApprovalLogRow[] = poApprovalRes.ok ? await poApprovalRes.json() : [];

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

    // price_list_sync_log has one row per (item, tier) — merge into one entry
    // per item with the tiers it was added to, keyed by the run's date.
    const priceListItems = new Map<string, { item_id: string; item_name: string; tiers: string[]; created_at: string }>();
    for (const row of priceListRows) {
      const existing = priceListItems.get(row.item_id);
      if (existing) existing.tiers.push(row.tier);
      else priceListItems.set(row.item_id, { item_id: row.item_id, item_name: row.item_name, tiers: [row.tier], created_at: row.created_at });
    }
    const priceListByDate = new Map<string, Array<{ item_id: string; item_name: string; tiers: string[]; created_at: string }>>();
    for (const item of priceListItems.values()) {
      const date = jakartaDate(item.created_at);
      const list = priceListByDate.get(date);
      if (list) list.push(item);
      else priceListByDate.set(date, [item]);
    }

    const salespersonByDate = new Map<string, SalespersonAssignLogRow[]>();
    for (const row of salespersonRows) {
      const date = jakartaDate(row.assigned_at);
      const list = salespersonByDate.get(date);
      if (list) list.push(row);
      else salespersonByDate.set(date, [row]);
    }

    const soApprovalsByDate = new Map<string, SOApprovalLogRow[]>();
    for (const row of soApprovalRows) {
      const date = jakartaDate(row.approved_at);
      const list = soApprovalsByDate.get(date);
      if (list) list.push(row);
      else soApprovalsByDate.set(date, [row]);
    }

    // Every approved PO is counted (matches "how many POs approved"), but
    // stock_items — the for_stock/excess_stock lines — is what the Director
    // actually needs to review; a clean PO just has an empty stock_items array.
    const poApprovalsByDate = new Map<string, POApprovalLogRow[]>();
    for (const row of poApprovalRows) {
      const date = jakartaDate(row.approved_at);
      const list = poApprovalsByDate.get(date);
      if (list) list.push(row);
      else poApprovalsByDate.set(date, [row]);
    }

    const allDates = new Set([
      ...customersByDate.keys(), ...invoicesByDate.keys(), ...sentInvoicesByDate.keys(),
      ...priceListByDate.keys(), ...salespersonByDate.keys(), ...soApprovalsByDate.keys(), ...poApprovalsByDate.keys(),
    ]);

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
        priceListItems: (priceListByDate.get(date) || []).map(i => ({
          item_id: i.item_id,
          item_name: i.item_name,
          tiers: i.tiers,
          created_at: i.created_at,
        })),
        salespersonAssignments: (salespersonByDate.get(date) || []).map(s => ({
          document_type: s.document_type,
          document_id: s.document_id,
          document_number: s.document_number,
          customer_name: s.customer_name,
          salesperson_name: s.salesperson_name,
          assigned_at: s.assigned_at,
        })),
        soApprovals: (soApprovalsByDate.get(date) || []).map(a => ({
          salesorder_id: a.salesorder_id,
          salesorder_number: a.salesorder_number,
          customer_name: a.customer_name,
          total: a.total,
          item_count: a.item_count,
          approved_by: a.approved_by,
          approved_at: a.approved_at,
        })),
        poApprovals: (poApprovalsByDate.get(date) || []).map(a => ({
          purchaseorder_id: a.purchaseorder_id,
          purchaseorder_number: a.purchaseorder_number,
          vendor_name: a.vendor_name,
          total: a.total,
          stock_items: a.stock_items,
          approved_by: a.approved_by,
          approved_at: a.approved_at,
        })),
      }));

    return NextResponse.json({ success: true, days });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
