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


async function safeFetchAllPages(path: string, key: string, label: string) {
  try {
    return await fetchAllPages(path, key);
  } catch (err) {
    console.warn(`[Purchases] Skipping ${label} endpoint: ${path}`, err);
    return [] as Record<string, unknown>[];
  }
}

interface SOLineItem {
  item_id: string;
  name: string;
  sku: string;
  quantity: number;
  quantity_shipped: number;
}

interface ConfirmedSO {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  line_items: SOLineItem[];
}

interface ItemMatch {
  salesorder_number: string;
  customer_name: string;
  so_quantity: number;
  fulfilled_qty: number;
}

export interface POLineItem {
  item_id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  location_name: string;
  matches: ItemMatch[];
  matched_qty: number;
  stock_qty: number;
  match_status: 'matched' | 'multi_match' | 'partial_so' | 'excess_stock' | 'for_stock' | 'needs_review';
}

export interface IssuedPO {
  purchaseorder_id: string;
  purchaseorder_number: string;
  vendor_name: string;
  date: string;
  expected_delivery_date: string;
  status: string;
  total: number;
  total_quantity: number;
  billed_status: string;
  received_status: string;
  quantity_yet_to_receive: number;
  location_name: string;
  line_items: POLineItem[];
  fulfillment_type: 'so_fulfillment' | 'multi_so' | 'mixed' | 'stock_only' | 'needs_review';
  matched_so_numbers: string[];
}

function matchItems(poItems: Record<string, unknown>[], confirmedSOs: ConfirmedSO[]): POLineItem[] {
  const itemMap = new Map<string, Array<{ so: ConfirmedSO; item: SOLineItem }>>();
  for (const so of confirmedSOs) {
    for (const item of so.line_items) {
      if (!item.item_id) continue;
      if (!itemMap.has(item.item_id)) itemMap.set(item.item_id, []);
      itemMap.get(item.item_id)!.push({ so, item });
    }
  }

  return poItems.map(li => {
    const itemId = String(li.item_id || '');
    const poQty = Number(li.quantity) || 0;
    const entries = itemMap.get(itemId) || [];
    const matches: ItemMatch[] = [];
    let remaining = poQty;

    for (const { so, item } of entries) {
      if (remaining <= 0) break;
      const need = Math.max(0, item.quantity - (item.quantity_shipped || 0));
      if (need <= 0) continue;
      const fulfilled = Math.min(remaining, need);
      remaining -= fulfilled;
      matches.push({
        salesorder_number: so.salesorder_number,
        customer_name: so.customer_name,
        so_quantity: item.quantity,
        fulfilled_qty: fulfilled,
      });
    }

    const matched_qty = poQty - remaining;
    const stock_qty = remaining;

    let match_status: POLineItem['match_status'];
    if (!itemId) match_status = 'needs_review';
    else if (matches.length === 0) match_status = 'for_stock';
    else if (matches.length === 1 && stock_qty === 0)
      match_status = matched_qty >= matches[0].so_quantity ? 'matched' : 'partial_so';
    else if (matches.length > 1 && stock_qty === 0) match_status = 'multi_match';
    else match_status = 'excess_stock';

    return {
      item_id: itemId,
      name: String(li.name || ''),
      sku: String(li.sku || ''),
      unit: String(li.unit || 'sht'),
      quantity: poQty,
      rate: Number(li.rate) || 0,
      amount: Number(li.item_total || 0) || Number(li.amount || 0),
      location_name: String(li.location_name || ''),
      matches,
      matched_qty,
      stock_qty,
      match_status,
    };
  });
}

function classifyFulfillment(items: POLineItem[]): IssuedPO['fulfillment_type'] {
  const hasReview = items.some(i => i.match_status === 'needs_review');
  const hasMatched = items.some(i => i.matches.length > 0);
  const hasStock = items.some(i => i.stock_qty > 0 || i.match_status === 'for_stock');
  const soSet = new Set(items.flatMap(i => i.matches.map(m => m.salesorder_number)));
  if (hasReview) return 'needs_review';
  if (!hasMatched) return 'stock_only';
  if (hasStock) return 'mixed';
  if (soSet.size > 1) return 'multi_so';
  return 'so_fulfillment';
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode');

  // Pending approval POs
  if (mode === 'pending_approval') {
    try {
      const token = await getZohoAccessToken();
      const base = getZohoApiBaseUrl();
      const orgId = getZohoOrgId();
      const res = await fetch(`${base}/purchaseorders?status=pending_approval&per_page=100&organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const data = await res.json();
      return NextResponse.json({ success: true, purchaseorders: data.purchaseorders || [] });
    } catch(err) { return NextResponse.json({ success: false, error: String(err) }, { status: 500 }); }
  }

  // Received but not billed
  if (mode === 'received_not_billed') {
    try {
      const token = await getZohoAccessToken();
      const base = getZohoApiBaseUrl();
      const orgId = getZohoOrgId();
      const res = await fetch(`${base}/purchaseorders?status=open&billed_status=to_be_billed&per_page=100&organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const data = await res.json();
      // Only include POs that have been at least partially received
      const pos = (data.purchaseorders || []).filter((p: Record<string, unknown>) =>
        p.received_status === 'received' || p.received_status === 'partially_received'
      );
      return NextResponse.json({ success: true, purchaseorders: pos });
    } catch(err) { return NextResponse.json({ success: false, error: String(err) }, { status: 500 }); }
  }

  try {
    await getZohoAccessToken();

    // Status mapping:
    // pending_approval = Draft (needs review & approval in Zoho)
    // open             = Issued (approved, sent to vendor)
    // approved         = Approved (awaiting receipt)
    // billed/closed    = Closed (hidden)
    const [draftPOList, issuedPOList, soList] = await Promise.all([
      safeFetchAllPages('/purchaseorders?status=pending_approval&sort_column=date&sort_order=D', 'purchaseorders', 'draft/pending approval POs'),
      safeFetchAllPages('/purchaseorders?status=open&sort_column=date&sort_order=D', 'purchaseorders', 'issued/open POs'),
      // Zoho can return code:1000 when status=confirmed is combined with invoiced_status=not_invoiced.
      // Fetch confirmed SOs first, then match/filter inside VIA instead of relying on that fragile Zoho filter.
      safeFetchAllPages('/salesorders?status=confirmed&sort_column=date&sort_order=D', 'salesorders', 'confirmed SOs'),
    ]);

    console.log(`[Purchases] draft(pending_approval)=${draftPOList.length} issued(open)=${issuedPOList.length} confirmed_sos=${soList.length}`);

    // Fetch confirmed SO details for line item matching
    const BATCH = 10;
    const confirmedSOs: ConfirmedSO[] = [];
    for (let i = 0; i < soList.length; i += BATCH) {
      const batch = soList.slice(i, i + BATCH);
      const details = await Promise.all(
        batch.map(async (so: Record<string, unknown>) => {
          try { const r = await zohoGet('/salesorders/' + so.salesorder_id); return r.salesorder; }
          catch { return null; }
        })
      );
      for (const so of details) {
        if (!so) continue;
        confirmedSOs.push({
          salesorder_id: String(so.salesorder_id),
          salesorder_number: String(so.salesorder_number),
          customer_name: String(so.customer_name),
          line_items: (so.line_items || []).map((li: Record<string, unknown>) => ({
            item_id: String(li.item_id || ''),
            name: String(li.name || ''),
            sku: String(li.sku || ''),
            quantity: Number(li.quantity) || 0,
            quantity_shipped: Number(li.quantity_shipped) || 0,
          })),
        });
      }
    }

    // Process both PO lists with line item detail + matching
    async function buildPOs(poList: Record<string, unknown>[], withMatching: boolean): Promise<IssuedPO[]> {
      const result: IssuedPO[] = [];
      for (let i = 0; i < poList.length; i += BATCH) {
        const batch = poList.slice(i, i + BATCH);
        const details = await Promise.all(
          batch.map(async (po: Record<string, unknown>) => {
            try { const r = await zohoGet('/purchaseorders/' + po.purchaseorder_id); return r.purchaseorder; }
            catch { return null; }
          })
        );
        for (const po of details) {
          if (!po) continue;
          const rawItems = po.line_items || [];
          const lineItems = withMatching ? matchItems(rawItems, confirmedSOs) : rawItems.map((li: Record<string, unknown>) => ({
            item_id: String(li.item_id || ''),
            name: String(li.name || ''),
            sku: String(li.sku || ''),
            unit: String(li.unit || 'sht'),
            quantity: Number(li.quantity) || 0,
            rate: Number(li.rate) || 0,
            amount: Number(li.item_total || 0),
            location_name: String(li.location_name || ''),
            matches: [],
            matched_qty: 0,
            stock_qty: Number(li.quantity) || 0,
            match_status: 'for_stock' as const,
          }));

          const soNumbers = [...new Set(lineItems.flatMap((i: POLineItem) => i.matches.map((m: ItemMatch) => m.salesorder_number)))];
          const totalQty = rawItems.reduce((s: number, li: Record<string, unknown>) => s + (Number(li.quantity) || 0), 0);

          result.push({
            purchaseorder_id: String(po.purchaseorder_id),
            purchaseorder_number: String(po.purchaseorder_number),
            vendor_name: String(po.vendor_name),
            date: String(po.date || ''),
            expected_delivery_date: String(po.expected_delivery_date || po.delivery_date || ''),
            status: String(po.status),
            total: Number(po.total) || 0,
            total_quantity: totalQty,
            billed_status: String(po.billed_status || ''),
            received_status: String(po.received_status || ''),
            quantity_yet_to_receive: Number(po.quantity_yet_to_receive) || 0,
            location_name: String(po.location_name || ''),
            line_items: lineItems,
            fulfillment_type: withMatching ? classifyFulfillment(lineItems) : 'stock_only',
            matched_so_numbers: soNumbers,
          });
        }
      }
      return result;
    }

    // Both draft and issued POs get SO matching
    const [draftPOs, issuedPOs] = await Promise.all([
      buildPOs(draftPOList, true),
      buildPOs(issuedPOList, true),
    ]);

    return NextResponse.json({ success: true, draft_pos: draftPOs, issued_pos: issuedPOs, so_count: confirmedSOs.length });

  } catch (err) {
    console.error('[Purchases] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { purchaseorder_ids } = body as { purchaseorder_ids: string[] };
    if (!purchaseorder_ids?.length) return NextResponse.json({ error: 'purchaseorder_ids required' }, { status: 400 });

    const results: Array<{
      purchaseorder_id: string;
      purchaseorder_number: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const poId of purchaseorder_ids) {
      try {
        const detail = await zohoGet('/purchaseorders/' + poId);
        const po = detail.purchaseorder;
        if (!po) throw new Error('Purchase Order not found');
        if (String(po.status) !== 'pending_approval') throw new Error('Only Pending Approval POs can be approved (current: ' + po.status + ')');

        const token = await getZohoAccessToken();
        const base = getZohoApiBaseUrl();
        const orgId = getZohoOrgId();

        // Approve = change status from pending_approval to open (issued)
        const url = `${base}/purchaseorders/${poId}/status/open?organization_id=${orgId}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const resBody = await res.json();
        if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(resBody)}`);

        results.push({ purchaseorder_id: poId, purchaseorder_number: String(po.purchaseorder_number), success: true });
      } catch (e) {
        results.push({ purchaseorder_id: poId, purchaseorder_number: poId, success: false, error: String(e) });
      }
    }

    return NextResponse.json({
      success: true,
      approved: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
