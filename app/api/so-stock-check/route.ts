import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: controller.signal });
    const body = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function zohoPost(path: string, data: Record<string, unknown> = {}) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const url = `${base}${path}?organization_id=${orgId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function fetchAllPages(path: string, key: string, options: { optional?: boolean } = {}) {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    try {
      const sep = path.includes('?') ? '&' : '?';
      const res = await zohoGet(path + sep + 'per_page=200&page=' + page);
      const batch = (res[key] || []) as Record<string, unknown>[];
      items.push(...batch);
      hasMore = batch.length === 200;
      page++;
      if (page > 5) break;
    } catch (err) {
      console.warn(`[SOStockCheck] Skipping Zoho endpoint ${path} page ${page}:`, err);
      if (options.optional) return items;
      throw err;
    }
  }
  return items;
}

// Sub-status codes
const SUB_STATUS = {
  ORDERED: 'cs_awaitin',
  STOCK_READY: 'cs_readyfo',
  INDENT: 'cs_indent',
};

function agingDays(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export interface SOItemCheck {
  item_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  location_id: string;
  location_name: string;
  location_stock_on_hand: number;
  shortage: number;           // how many short (0 if enough)
  po_number: string;          // open PO covering this item
  po_quantity: number;        // PO qty for this item
  po_id: string;
  status: 'ready' | 'ordered' | 'needs_po' | 'indent';
}

export interface SOStockResult {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  confirmed_date: string;
  aging_days: number;
  current_sub_status: string;
  items: SOItemCheck[];
  overall_status: 'all_ready' | 'all_ordered' | 'needs_po' | 'mixed';
  updated_sub_status?: string;  // if we updated it
}

// ─── GET: Check all confirmed SOs ────────────────────────────────────────────

export async function GET() {
  try {
    await getZohoAccessToken();

    // Fetch confirmed SOs + all open/issued POs in parallel
    const soList = await fetchAllPages('/salesorders?status=confirmed&sort_column=date&sort_order=D', 'salesorders');

    // Some Zoho Books orgs return code 1000 for certain PO status filters.
    // Keep SO stock checking usable even when one PO filter fails.
    const [openPOList, issuedPOList] = await Promise.all([
      fetchAllPages('/purchaseorders?status=open&sort_column=date&sort_order=D', 'purchaseorders', { optional: true }),
      fetchAllPages('/purchaseorders?status=approved&sort_column=date&sort_order=D', 'purchaseorders', { optional: true }),
    ]);

    // Build item_id → PO map (non-closed POs)
    const allActivePOs = [...openPOList, ...issuedPOList];
    const itemPOMap = new Map<string, { po_number: string; po_id: string; qty: number; qty_yet_to_receive: number }>();

    for (const po of allActivePOs) {
      try {
        const detail = await zohoGet('/purchaseorders/' + po.purchaseorder_id);
        for (const li of detail.purchaseorder?.line_items || []) {
          const itemId = String(li.item_id || '');
          if (!itemId) continue;
          const existing = itemPOMap.get(itemId);
          const qtyYTR = Number(li.quantity) - (Number(li.quantity_received) || 0);
          if (!existing || qtyYTR > existing.qty_yet_to_receive) {
            itemPOMap.set(itemId, {
              po_number: String(po.purchaseorder_number || ''),
              po_id: String(po.purchaseorder_id || ''),
              qty: Number(li.quantity) || 0,
              qty_yet_to_receive: qtyYTR,
            });
          }
        }
      } catch { /* skip */ }
    }

    console.log(`[SOStockCheck] ${soList.length} SOs, ${allActivePOs.length} active POs, ${itemPOMap.size} unique items in POs`);

    // Process each SO
    const results: SOStockResult[] = [];
    const BATCH = 5; // smaller batch since we fetch item details

    for (let i = 0; i < soList.length; i += BATCH) {
      const batch = soList.slice(i, i + BATCH);

      const details = await Promise.all(
        batch.map(async (so) => {
          try {
            const r = await zohoGet('/salesorders/' + so.salesorder_id);
            return r.salesorder;
          } catch { return null; }
        })
      );

      for (const so of details) {
        if (!so) continue;

        // Get per-location stock for each unique item
        const lineItems = (so.line_items || []) as Record<string, unknown>[];
        const uniqueItemIds = [...new Set(lineItems.map(li => String(li.item_id || '')).filter(Boolean))];

        // Build location stock map for items in this SO
        const itemLocStockMap = new Map<string, number>();
        await Promise.all(uniqueItemIds.map(async (itemId) => {
          try {
            const itemDetail = await zohoGet('/items/' + itemId);
            if (!itemDetail.item) return; // item not found or deleted
            const locations = (itemDetail.item?.locations || []) as Record<string, unknown>[];
            for (const loc of locations) {
              itemLocStockMap.set(
                itemId + '_' + String(loc.location_id),
                Number(loc.location_stock_on_hand) || 0
              );
            }
          } catch { /* item unavailable — use 0 stock */ }
        }));

        // Check each line item
        const itemChecks: SOItemCheck[] = lineItems.map(li => {
          const itemId = String(li.item_id || '');
          const locationId = String(li.location_id || '');
          const qty = Number(li.quantity) || 0;
          const locStock = itemLocStockMap.get(itemId + '_' + locationId) ?? 0;
          const shortage = Math.max(0, qty - locStock); // how many units short
          const hasPO = itemPOMap.has(itemId);
          const poData = itemPOMap.get(itemId);

          let status: SOItemCheck['status'];
          if (locStock >= qty) status = 'ready';          // enough stock for this SO
          else if (hasPO) status = 'ordered';             // not enough but PO exists
          else status = 'needs_po';                       // not enough and no PO

          return {
            item_id: itemId,
            name: String(li.name || ''),
            sku: String(li.sku || ''),
            quantity: qty,
            unit: String(li.unit || 'sht'),
            location_id: locationId,
            location_name: String(li.location_name || ''),
            location_stock_on_hand: locStock,
            shortage,
            po_number: poData?.po_number || '',
            po_quantity: poData?.qty || 0,
            po_id: poData?.po_id || '',
            status,
          };
        });

        // Overall status
        const shortItems = itemChecks.filter(i => i.status !== 'ready');
        const allReady = shortItems.length === 0;
        const allOrdered = shortItems.length > 0 && shortItems.every(i => i.status === 'ordered');
        const noneOrdered = shortItems.length > 0 && shortItems.every(i => i.status === 'needs_po');
        // partial = some short items have PO, some don't

        let overall: SOStockResult['overall_status'];
        if (allReady) overall = 'all_ready';
        else if (allOrdered) overall = 'all_ordered';
        else if (noneOrdered) overall = 'needs_po';
        else overall = 'mixed'; // partial ordered

        results.push({
          salesorder_id: String(so.salesorder_id),
          salesorder_number: String(so.salesorder_number || ''),
          customer_name: String(so.customer_name || ''),
          confirmed_date: String(so.submitted_date || so.date || ''),
          aging_days: agingDays(String(so.submitted_date || so.date || '')),
          current_sub_status: String(so.current_sub_status || ''),
          items: itemChecks,
          overall_status: overall,
        });
      }
    }

    // Sort: needs_po first, then by aging desc
    results.sort((a, b) => {
      const priority = { needs_po: 0, mixed: 1, all_ordered: 2, all_ready: 3 };
      const pd = (priority[a.overall_status] ?? 9) - (priority[b.overall_status] ?? 9);
      if (pd !== 0) return pd;
      return b.aging_days - a.aging_days;
    });

    return NextResponse.json({ success: true, results });

  } catch (err) {
    console.error('[SOStockCheck] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ─── POST: Update SO sub-status ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { salesorder_id, sub_status } = body as { salesorder_id: string; sub_status: string };

    if (!salesorder_id || !sub_status) {
      return NextResponse.json({ error: 'salesorder_id and sub_status required' }, { status: 400 });
    }

    // Validate sub_status
    const validStatuses = Object.values(SUB_STATUS);
    if (!validStatuses.includes(sub_status)) {
      return NextResponse.json({ error: 'Invalid sub_status. Use: ' + validStatuses.join(', ') }, { status: 400 });
    }

    const res = await zohoPost('/salesorders/' + salesorder_id + '/status/' + sub_status);

    return NextResponse.json({
      success: true,
      message: res.message || 'Status updated',
    });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
