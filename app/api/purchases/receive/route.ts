import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}${path}${sep}organization_id=${orgId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal: controller.signal,
    });
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function zohoPost(path: string, data: Record<string, unknown>) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${path}${sep}organization_id=${orgId}`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok && body.code !== 0) throw new Error(`Zoho ${res.status}: ${body.message || JSON.stringify(body)}`);
  return body;
}

// GET: fetch PO details with receives
export async function GET(request: NextRequest) {
  try {
    const poId = request.nextUrl.searchParams.get('po_id');
    if (!poId) return NextResponse.json({ error: 'po_id required' }, { status: 400 });

    const [poDetail, receivesList] = await Promise.all([
      zohoGet(`/purchaseorders/${poId}`),
      zohoGet(`/purchasereceives?purchaseorder_id=${poId}&per_page=50`),
    ]);

    const po = poDetail.purchaseorder;
    const receives = (receivesList.purchasereceives || []) as Record<string, unknown>[];

    // Find unbilled receives
    const unbilledReceives = receives.filter(r => String(r.billed_status) !== 'billed');

    return NextResponse.json({
      success: true,
      po: {
        purchaseorder_id: po?.purchaseorder_id,
        purchaseorder_number: po?.purchaseorder_number,
        vendor_id: po?.vendor_id,
        vendor_name: po?.vendor_name,
        received_status: po?.received_status,
        billed_status: po?.billed_status,
        line_items: (po?.line_items || []).map((li: Record<string, unknown>) => ({
          line_item_id: li.line_item_id,
          item_id: li.item_id,
          name: li.name,
          sku: li.sku,
          quantity: Number(li.quantity),
          quantity_received: Number(li.quantity_received) || 0,
          rate: Number(li.rate),
          unit: li.unit,
          location_id: li.location_id,
          location_name: li.location_name,
          tax_id: li.tax_id,
        })),
      },
      receives: receives.map(r => ({
        purchasereceive_id: r.purchasereceive_id,
        purchasereceive_number: r.purchasereceive_number,
        receive_date: r.receive_date,
        billed_status: r.billed_status,
        quantity_received: r.quantity_received,
      })),
      unbilled_count: unbilledReceives.length,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// POST: create receive, then optionally create bill
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, po_id, line_items, date, create_bill, bill_number } = body as {
      action: 'receive' | 'bill';
      po_id: string;
      line_items: Array<{ line_item_id: string; quantity_received: number }>;
      date: string;
      create_bill?: boolean;
      bill_number?: string;
    };

    if (!po_id) return NextResponse.json({ error: 'po_id required' }, { status: 400 });

    const result: Record<string, unknown> = {};

    // Step 1: Create receive
    if (action === 'receive' || action === undefined) {
      const receivePayload = {
        date: date || new Date().toISOString().split('T')[0],
        line_items: line_items.map(li => ({
          line_item_id: li.line_item_id,
          quantity: li.quantity_received,         // some Zoho versions use 'quantity'
          quantity_received: li.quantity_received, // some use 'quantity_received'
        })),
      };

      console.log('[Receive] Payload:', JSON.stringify(receivePayload, null, 2));
      const receiveData = await zohoPost(
        `/purchasereceives?purchaseorder_id=${po_id}`,
        receivePayload
      );

      const receive = receiveData.purchasereceive;
      result.receive = {
        purchasereceive_id: receive?.purchasereceive_id || receive?.receive_id,
        receive_number: receive?.receive_number || receive?.purchasereceive_number,
        success: true,
      };

      // Step 2: Create bill if requested
      if (create_bill && receive) {
        try {
          const receiveId = receive.purchasereceive_id || receive.receive_id;

          // Get PO detail for bill line items
          const poDetail = await zohoGet(`/purchaseorders/${po_id}`);
          const po = poDetail.purchaseorder;

          // Get receive detail for receive_item_id
          const receiveDetail = await zohoGet(`/purchasereceives/${receiveId}`);
          const receiveLineItems = receiveDetail.purchasereceive?.line_items || [];

          // Build bill line items
          const billLineItems = (po?.line_items || []).map((poli: Record<string, unknown>, idx: number) => {
            const rli = receiveLineItems[idx] || {};
            return {
              purchaseorder_id: po_id,
              purchaseorder_item_id: poli.line_item_id,
              receive_id: receiveId,
              receive_item_id: rli.receive_item_id || rli.purchasereceive_item_id,
              item_id: poli.item_id,
              name: poli.name,
              quantity: line_items.find(l => l.line_item_id === poli.line_item_id)?.quantity_received || poli.quantity,
              rate: poli.rate,
              unit: poli.unit,
              location_id: poli.location_id,
              tax_id: poli.tax_id,
            };
          }).filter((li: Record<string, unknown>) =>
            line_items.some(l => l.line_item_id === li.purchaseorder_item_id)
          );

          const billData = await zohoPost('/bills', {
            vendor_id: po?.vendor_id,
            date: date || new Date().toISOString().split('T')[0],
            bill_number: bill_number || po?.purchaseorder_number,
            line_items: billLineItems,
          });

          result.bill = {
            bill_id: billData.bill?.bill_id,
            bill_number: billData.bill?.bill_number,
            success: true,
          };
        } catch (billErr) {
          result.bill = { success: false, error: String(billErr) };
        }
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
