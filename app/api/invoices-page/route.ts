import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function fetchAllPages(path: string, key: string) {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await zohoGet(path + sep + 'per_page=200&page=' + page);
    const batch = (res[key] || []) as Record<string, unknown>[];
    items.push(...batch);
    hasMore = batch.length === 200;
    page++;
    if (page > 10) break;
  }
  return items;
}

export interface InvoiceLineItem {
  line_item_id: string;
  item_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  rate: number;
  location_id: string;
  location_name: string;
  available_stock: number;
  committed_stock: number;
  stock_on_hand: number;           // total across all locations
  location_stock_on_hand: number;  // stock at this invoice's specific location
  is_available: boolean;           // location_stock_on_hand >= quantity
  shortage: number;
}

export interface DraftInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string;
  date: string;
  due_date: string;
  total: number;
  balance: number;
  salesperson_name: string;
  location_name: string;
  salesorder_number: string;
  line_items: InvoiceLineItem[];
  all_available: boolean;   // all items have enough stock
  partial_available: boolean;
  unavailable_count: number;
}

export interface OverdueInvoice {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string;
  date: string;
  due_date: string;
  total: number;
  balance: number;
  salesperson_name: string;
  location_name: string;
  days_overdue: number;
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode');
  const id = request.nextUrl.searchParams.get('id');

  // PDF URL mode — get Zoho invoice PDF download URL
  if (mode === 'pdf_url' && id) {
    try {
      const token = await getZohoAccessToken();
      const base = getZohoApiBaseUrl();
      const orgId = getZohoOrgId();
      // Zoho provides PDF via content-type PDF endpoint
      const pdfUrl = `${base}/invoices/${id}?accept=pdf&organization_id=${orgId}&token=${token}`;
      // Return the direct download URL — client opens it
      return NextResponse.json({ success: true, url: pdfUrl });
    } catch(err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  try {
    await getZohoAccessToken();

    const [draftList, overdueList] = await Promise.all([
      fetchAllPages('/invoices?status=draft&sort_column=date&sort_order=D', 'invoices'),
      fetchAllPages('/invoices?status=overdue&sort_column=due_date&sort_order=A', 'invoices'),
    ]);

    console.log(`[Invoices] draft=${draftList.length} overdue=${overdueList.length}`);

    // Fetch draft invoice details (line items with stock)
    const BATCH = 10;
    const draftInvoices: DraftInvoice[] = [];

    for (let i = 0; i < draftList.length; i += BATCH) {
      const batch = draftList.slice(i, i + BATCH);
      const details = await Promise.all(
        batch.map(async (inv: Record<string, unknown>) => {
          try {
            const r = await zohoGet('/invoices/' + inv.invoice_id);
            return r.invoice;
          } catch { return null; }
        })
      );

      for (const inv of details) {
        if (!inv) continue;
        // Fetch per-location stock for each unique item in this invoice
        const uniqueItemIds = [...new Set((inv.line_items || []).map((li: Record<string, unknown>) => String(li.item_id || '')).filter(Boolean))];
        const itemLocationMap = new Map<string, Map<string, number>>(); // item_id -> location_id -> location_stock_on_hand

        await Promise.all(uniqueItemIds.map(async (itemId) => {
          try {
            const itemDetail = await zohoGet('/items/' + itemId);
            const locations = (itemDetail.item?.locations || []) as Record<string, unknown>[];
            const locMap = new Map<string, number>();
            for (const loc of locations) {
              locMap.set(String(loc.location_id), Number(loc.location_stock_on_hand) || 0);
            }
            itemLocationMap.set(itemId, locMap);
          } catch { /* use fallback */ }
        }));

        const lineItems: InvoiceLineItem[] = (inv.line_items || []).map((li: Record<string, unknown>) => {
          const qty = Number(li.quantity) || 0;
          const itemId = String(li.item_id || '');
          const locationId = String(li.location_id || '');
          const totalStockOnHand = Number(li.stock_on_hand) || 0;

          // Use per-location stock — Zoho checks location-specific stock for out-transactions
          const locMap = itemLocationMap.get(itemId);
          const locationStockOnHand = locMap ? (locMap.get(locationId) ?? 0) : totalStockOnHand;

          const shortage = Math.max(0, qty - locationStockOnHand);
          return {
            line_item_id: String(li.line_item_id || ''),
            item_id: itemId,
            name: String(li.name || ''),
            sku: String(li.sku || ''),
            quantity: qty,
            unit: String(li.unit || 'sht'),
            rate: Number(li.rate) || 0,
            location_id: locationId,
            location_name: String(li.location_name || ''),
            available_stock: locationStockOnHand,
            committed_stock: Number(li.committed_stock) || 0,
            stock_on_hand: locationStockOnHand,
            location_stock_on_hand: locationStockOnHand,
            is_available: shortage === 0,
            shortage,
          };
        });

        const unavailableCount = lineItems.filter(li => !li.is_available).length;
        const allAvailable = lineItems.length > 0 && unavailableCount === 0;
        const partialAvailable = unavailableCount > 0 && unavailableCount < lineItems.length;

        draftInvoices.push({
          invoice_id: String(inv.invoice_id),
          invoice_number: String(inv.invoice_number || ''),
          customer_name: String(inv.customer_name || ''),
          customer_id: String(inv.customer_id || ''),
          date: String(inv.date || ''),
          due_date: String(inv.due_date || ''),
          total: Number(inv.total) || 0,
          balance: Number(inv.balance) || 0,
          salesperson_name: String(inv.salesperson_name || ''),
          location_name: String(inv.location_name || ''),
          salesorder_number: String(inv.salesorder_number || inv.reference_number || ''),
          line_items: lineItems,
          all_available: allAvailable,
          partial_available: partialAvailable,
          unavailable_count: unavailableCount,
        });
      }
    }

    // Overdue — simple list, no detail needed
    const now = new Date();
    const overdueInvoices: OverdueInvoice[] = overdueList.map(inv => {
      const dueDate = String(inv.due_date || '');
      let daysOverdue = 0;
      if (dueDate) {
        daysOverdue = Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86400000);
      }
      return {
        invoice_id: String(inv.invoice_id),
        invoice_number: String(inv.invoice_number || ''),
        customer_name: String(inv.customer_name || ''),
        customer_id: String(inv.customer_id || ''),
        date: String(inv.date || ''),
        due_date: dueDate,
        total: Number(inv.total) || 0,
        balance: Number(inv.balance) || 0,
        salesperson_name: String(inv.salesperson_name || ''),
        location_name: String(inv.location_name || ''),
        days_overdue: Math.max(0, daysOverdue),
      };
    });

    return NextResponse.json({
      success: true,
      draft_invoices: draftInvoices,
      overdue_invoices: overdueInvoices,
    });

  } catch (err) {
    console.error('[Invoices] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ─── POST: Convert draft to sent ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invoice_ids } = body as { invoice_ids: string[] };
    if (!invoice_ids?.length) return NextResponse.json({ error: 'invoice_ids required' }, { status: 400 });

    const results: Array<{
      invoice_id: string;
      invoice_number: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const invId of invoice_ids) {
      try {
        // Validate it's still draft
        const detail = await zohoGet('/invoices/' + invId);
        const inv = detail.invoice;
        if (!inv) throw new Error('Invoice not found');
        if (String(inv.status) !== 'draft') throw new Error('Invoice is not in Draft status (current: ' + inv.status + ')');

        // Mark as sent
        const token = await getZohoAccessToken();
        const base = getZohoApiBaseUrl();
        const orgId = getZohoOrgId();
        const url = `${base}/invoices/${invId}/status/sent?organization_id=${orgId}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const resBody = await res.json();
        if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(resBody)}`);

        results.push({ invoice_id: invId, invoice_number: String(inv.invoice_number), success: true });
      } catch (e) {
        results.push({ invoice_id: invId, invoice_number: invId, success: false, error: String(e) });
      }
    }

    return NextResponse.json({
      success: true,
      converted: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
