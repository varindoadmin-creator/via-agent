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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmedNotReady {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  date: string;
  confirmed_date: string; // submitted_date = when SO was confirmed
  total: number;
  quantity: number;
  quantity_packed: number;
  quantity_shipped: number;
  delivery_method: string;
  salesperson_name: string;
  location_name: string;
  reason: string; // 'no_package' | 'partial_packed'
}

export interface PendingDelivery {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  so_date: string;
  total: number;
  quantity: number;
  quantity_packed: number;
  delivery_method: string;
  is_full: boolean; // quantity_packed >= quantity
  packages: Array<{
    package_id: string;
    package_number: string;
    shipment_id: string;
    shipment_number: string;
    shipment_status: string;
    date: string;
    shipment_date: string;
    tracking_number: string;
    carrier: string;
    quantity: number;
  }>;
}

export interface DeliveredNotInvoiced {
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  date: string;
  total: number;
  invoiced_status: string;
  quantity: number;
  delivery_method: string;
  salesperson_name: string;
  all_delivered: boolean; // true = can convert; false = partial, grayed out
  delivered_shipments: number;
  total_shipments: number;
  latest_delivery_date: string;
  packages: Array<{
    package_number: string;
    shipment_number: string;
    shipment_status: string;
    delivery_date: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchAllPages(path: string, key: string, options: { optional?: boolean } = {}): Promise<Record<string, unknown>[]> {
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
      if (page > 10) break;
    } catch (err) {
      console.warn(`[Shipments] Skipping Zoho endpoint ${path} page ${page}:`, err);
      if (options.optional) return items;
      throw err;
    }
  }
  return items;
}

async function fetchSoDetail(soId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await zohoGet('/salesorders/' + soId);
    return res.salesorder || null;
  } catch { return null; }
}

/**
 * Extract the dominant location from SO line items.
 * Line items carry the actual warehouse/hub location, not the SO header.
 */
function extractLineItemLocation(so: Record<string, unknown>): string {
  const lineItems = (so.line_items || []) as Record<string, unknown>[];
  if (!lineItems.length) return String(so.location_name || '');

  // Count occurrences of each location_id
  const counts = new Map<string, { name: string; count: number }>();
  for (const item of lineItems) {
    const locId = String(item.location_id || '');
    const locName = String(item.location_name || '');
    if (!locId) continue;
    const existing = counts.get(locId);
    if (existing) existing.count++;
    else counts.set(locId, { name: locName, count: 1 });
  }

  if (!counts.size) return String(so.location_name || '');

  // Return the most common location name
  let max = 0;
  let result = String(so.location_name || '');
  for (const [, v] of counts) {
    if (v.count > max) { max = v.count; result = v.name; }
  }
  return result;
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'all';

  // Pending Approval SOs mode
  if (mode === 'pending_approval') {
    try {
      const token = await getZohoAccessToken();
      const base = getZohoApiBaseUrl();
      const orgId = getZohoOrgId();
      const res = await fetch(`${base}/salesorders?status=pending_approval&per_page=200&sort_column=date&sort_order=D&organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const data = await res.json();
      return NextResponse.json({ success: true, salesorders: data.salesorders || [] });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // Draft SOs mode
  if (mode === 'drafts') {
    try {
      const token = await getZohoAccessToken();
      const base = getZohoApiBaseUrl();
      const orgId = getZohoOrgId();
      const res = await fetch(`${base}/salesorders?status=draft&per_page=200&sort_column=date&sort_order=D&organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const data = await res.json();
      return NextResponse.json({ success: true, salesorders: data.salesorders || [] });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // Approve draft SO
  if (mode === 'approve_draft') {
    const soId = searchParams.get('id');
    if (!soId) return NextResponse.json({ error: 'id required' }, { status: 400 });
    try {
      const token = await getZohoAccessToken();
      const base = getZohoApiBaseUrl();
      const orgId = getZohoOrgId();
      const res = await fetch(`${base}/salesorders/${soId}/approve?organization_id=${orgId}`, {
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok && data.code !== 0) throw new Error(`Zoho ${res.status}: ${data.message}`);
      return NextResponse.json({ success: true, message: data.message });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  // SO detail mode — returns line items with packed quantities
  if (mode === 'so_detail') {
    const soId = searchParams.get('id');
    if (!soId) return NextResponse.json({ error: 'id required' }, { status: 400 });
    try {
      const token = await getZohoAccessToken();
      const base = getZohoApiBaseUrl();
      const orgId = getZohoOrgId();
      const res = await fetch(`${base}/salesorders/${soId}?organization_id=${orgId}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      const data = await res.json();
      const so = data.salesorder;
      const lineItems = (so?.line_items || []).map((li: Record<string, unknown>) => ({
        name: String(li.name || ''),
        sku: String(li.sku || ''),
        quantity: Number(li.quantity) || 0,
        unit: String(li.unit || 'sht'),
        rate: Number(li.rate) || 0,
        item_total: Number(li.item_total) || 0,
        location_name: String(li.location_name || ''),
        quantity_packed: li.quantity_packed !== undefined ? Number(li.quantity_packed) : (li.quantity_shipped !== undefined ? Number(li.quantity_shipped) : 0),
      }));
      return NextResponse.json({ success: true, line_items: lineItems });
    } catch (err) {
      return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
  }

  try {
    // Pre-warm token once to avoid parallel refresh race condition
    await getZohoAccessToken();

    // ── Fetch base data in parallel ─────────────────────────────────────────
    const confirmedSOs = await fetchAllPages('/salesorders?status=confirmed&sort_column=date&sort_order=D', 'salesorders');

    // These shipment/package endpoints can return Zoho code 1000 for some orgs/status filters.
    // Treat them as optional so the page still loads and logs exactly which endpoint failed.
    const [shippedPackages, notShippedPackages, deliveredShipments, activeShipments] =
      await Promise.all([
        fetchAllPages('/packages?status=shipped&sort_column=date&sort_order=D', 'packages', { optional: true }),
        fetchAllPages('/packages?status=not_shipped&sort_column=date&sort_order=D', 'packages', { optional: true }),
        fetchAllPages('/shipmentorders?status=delivered&sort_column=date&sort_order=D', 'shipmentorders', { optional: true }),
        fetchAllPages('/shipmentorders?status=shipped&sort_column=date&sort_order=D', 'shipmentorders', { optional: true }),
      ]);

    // Filter delivered shipments to only those whose SO is not yet invoiced
    // Build a set of not-invoiced SO IDs from confirmed SOs
    const notInvoicedSoIds = new Set(confirmedSOs.map((s) => String(s.salesorder_id)));
    const filteredDeliveredShipments = deliveredShipments.filter(
      (s) => notInvoicedSoIds.has(String(s.salesorder_id))
    );

    console.log('[Shipments] SOs=' + confirmedSOs.length
      + ' pkg_shipped=' + shippedPackages.length
      + ' pkg_not_shipped=' + notShippedPackages.length
      + ' delivered_ships_total=' + deliveredShipments.length
      + ' delivered_ships_filtered=' + filteredDeliveredShipments.length
      + ' active_ships=' + activeShipments.length);

    // Build lookup maps
    const allActivePackages = [...shippedPackages, ...notShippedPackages];

    // shipment_id → shipment_number + status + date
    const shipmentMap = new Map<string, Record<string, unknown>>();
    for (const s of [...filteredDeliveredShipments, ...activeShipments]) {
      shipmentMap.set(String(s.shipment_id), s);
    }

    // salesorder_id → active packages (not delivered)
    const soActivePackagesMap = new Map<string, Record<string, unknown>[]>();
    for (const p of allActivePackages) {
      const soId = String(p.salesorder_id);
      if (!soActivePackagesMap.has(soId)) soActivePackagesMap.set(soId, []);
      soActivePackagesMap.get(soId)!.push(p);
    }

    // salesorder_id → delivered shipments
    const soDeliveredMap = new Map<string, Record<string, unknown>[]>();
    for (const s of filteredDeliveredShipments) {
      const soId = String(s.salesorder_id);
      if (!soDeliveredMap.has(soId)) soDeliveredMap.set(soId, []);
      soDeliveredMap.get(soId)!.push(s);
    }

    // ── TABLE 1: Confirmed, Not Ready ─────────────────────────────────────────
    const notReady: ConfirmedNotReady[] = [];
    if (mode === 'not_ready' || mode === 'all') {
      // Identify which SOs need detail fetch (for location from line items)
      const notReadyCandidates = confirmedSOs.filter(so => {
        const soId = String(so.salesorder_id);
        const hasActivePackage = soActivePackagesMap.has(soId);
        const hasDelivered = soDeliveredMap.has(soId);
        const invoicedStatus = String(so.invoiced_status || '');
        if (invoicedStatus === 'invoiced') return false;
        if (hasActivePackage) return false;
        const qtyPacked = Number(so.quantity_packed) || 0;
        const qty = Number(so.quantity) || 0;
        if (hasDelivered && qtyPacked >= qty && qty > 0) return false;
        return true;
      });

      // Fetch SO details in batches for line item locations
      const BATCH = 10;
      for (let i = 0; i < notReadyCandidates.length; i += BATCH) {
        const batch = notReadyCandidates.slice(i, i + BATCH);
        const details = await Promise.all(batch.map(so => fetchSoDetail(String(so.salesorder_id))));

        for (const so of details) {
          if (!so) continue;
          const soId = String(so.salesorder_id);
          const qtyPacked = Number(so.quantity_packed) || 0;
          const qty = Number(so.quantity) || 0;
          const qtyShipped = Number(so.quantity_shipped) || 0;
          const reason = qtyPacked === 0 ? 'no_package' : 'partial_packed';
          const locationName = extractLineItemLocation(so);

          notReady.push({
            salesorder_id: soId,
            salesorder_number: String(so.salesorder_number || ''),
            customer_name: String(so.customer_name || ''),
            date: String(so.date || ''),
            confirmed_date: String(so.submitted_date || so.last_modified_time || so.date || ''),
            total: Number(so.total) || 0,
            quantity: qty,
            quantity_packed: qtyPacked,
            quantity_shipped: qtyShipped,
            delivery_method: String(so.delivery_method || ''),
            salesperson_name: String(so.salesperson_name || ''),
            location_name: locationName,
            reason,
          });
        }
      }
    }

    // ── TABLE 2: Pending Delivery ─────────────────────────────────────────────
    const pendingDelivery: PendingDelivery[] = [];
    if (mode === 'pending' || mode === 'all') {
      // Group active packages by SO
      for (const [soId, pkgs] of soActivePackagesMap) {
        // Find the SO record
        const so = confirmedSOs.find(s => String(s.salesorder_id) === soId);
        if (!so) continue;

        const invoicedStatus = String(so.invoiced_status || '');
        if (invoicedStatus === 'invoiced') continue;

        const qty = Number(so.quantity) || 0;
        const qtyPacked = Number(so.quantity_packed) || 0;
        const isFull = qty > 0 && qtyPacked >= qty;

        const packageRows = pkgs.map(p => {
          const shipId = String(p.shipment_id || '');
          const shipData = shipmentMap.get(shipId) || {};
          return {
            package_id: String(p.package_id),
            package_number: String(p.package_number || ''),
            shipment_id: shipId,
            shipment_number: String(shipData.shipment_number || ''),
            shipment_status: String(p.status || ''),
            date: String(p.date || ''),
            shipment_date: String(p.shipment_date || shipData.date || ''),
            tracking_number: String(p.tracking_number || ''),
            carrier: String(shipData.carrier || p.delivery_method || ''),
            quantity: Number(p.quantity) || 0,
          };
        });

        pendingDelivery.push({
          salesorder_id: soId,
          salesorder_number: String(so.salesorder_number || ''),
          customer_name: String(so.customer_name || ''),
          so_date: String(so.date || ''),
          total: Number(so.total) || 0,
          quantity: qty,
          quantity_packed: qtyPacked,
          delivery_method: String(so.delivery_method || ''),
          is_full: isFull,
          packages: packageRows,
        });
      }

      // Sort by latest package date desc
      pendingDelivery.sort((a, b) => {
        const aDate = a.packages[0]?.date || a.so_date;
        const bDate = b.packages[0]?.date || b.so_date;
        return bDate.localeCompare(aDate);
      });
    }

    // ── TABLE 3: Delivered but Not Invoiced ───────────────────────────────────
    const deliveredNotInvoiced: DeliveredNotInvoiced[] = [];
    if (mode === 'delivered' || mode === 'all') {
      // Get unique SO IDs with delivered shipments
      const deliveredSoIds = Array.from(soDeliveredMap.keys());

      // Fetch SO details in batches of 10
      const BATCH = 10;
      for (let i = 0; i < deliveredSoIds.length; i += BATCH) {
        const batch = deliveredSoIds.slice(i, i + BATCH);
        const details = await Promise.all(batch.map(fetchSoDetail));

        for (const so of details) {
          if (!so) continue;
          const soId = String(so.salesorder_id);
          const inv = String(so.invoiced_status || '');

          if (inv === 'invoiced') continue;
          if (String(so.status) === 'void') continue;
          if (String(so.status) === 'draft') continue;

          const deliveredShips = soDeliveredMap.get(soId) || [];
          // Check all_delivered using SO detail packages directly
          // A package is "not delivered" if its shipment is not in delivered status
          // We use the SO detail packages array which has the full picture
          const soPackages: Record<string, unknown>[] = (so.packages || []) as Record<string, unknown>[];
          let allDelivered = deliveredShips.length > 0;

          if (allDelivered && soPackages.length > 0) {
            // Check each package's shipment status from our shipment maps
            for (const pkg of soPackages) {
              const shipId = String(pkg.shipment_id || '');
              if (!shipId) {
                // Package exists but no shipment yet — not all delivered
                allDelivered = false;
                break;
              }
              // Check if this shipment is in delivered status
              const isDelivered = deliveredShipments.some(s => String(s.shipment_id) === shipId) ||
                filteredDeliveredShipments.some(s => String(s.shipment_id) === shipId);
              if (!isDelivered) {
                allDelivered = false;
                break;
              }
            }
          } else if (soPackages.length === 0) {
            // No packages in SO detail — not ready
            allDelivered = false;
          }

          // Total shipments = count of unique shipment_ids across all SO packages
          const allShipIds = new Set<string>();
          for (const s of deliveredShips) allShipIds.add(String(s.shipment_id));
          for (const pkg of soPackages) {
            if (pkg.shipment_id) allShipIds.add(String(pkg.shipment_id));
          }
          const totalShipments = Math.max(allShipIds.size, soPackages.length);

          // Latest delivery date from delivered shipments
          const deliveryDates = deliveredShips
            .map(s => String(s.date || ''))
            .filter(Boolean)
            .sort()
            .reverse();
          const latestDeliveryDate = deliveryDates[0] || '';

          // Package summary rows (delivered only)
          const packageSummary = deliveredShips.map(s => ({
            package_number: String((s as Record<string, unknown>).associated_packages || ''),
            shipment_number: String(s.shipment_number || ''),
            shipment_status: String(s.status || ''),
            delivery_date: String(s.date || ''),
          }));

          deliveredNotInvoiced.push({
            salesorder_id: soId,
            salesorder_number: String(so.salesorder_number || ''),
            customer_name: String(so.customer_name || ''),
            date: String(so.date || ''),
            total: Number(so.total) || 0,
            invoiced_status: inv,
            quantity: Number(so.quantity) || 0,
            delivery_method: String(so.delivery_method || ''),
            salesperson_name: String(so.salesperson_name || ''),
            all_delivered: allDelivered,
            delivered_shipments: deliveredShips.length,
            total_shipments: totalShipments,
            latest_delivery_date: latestDeliveryDate,
            packages: packageSummary,
            location_name: extractLineItemLocation(so),
          });
        }
      }

      deliveredNotInvoiced.sort((a, b) => b.latest_delivery_date.localeCompare(a.latest_delivery_date));
    }

    return NextResponse.json({
      success: true,
      not_ready: notReady,
      pending: pendingDelivery,
      delivered: deliveredNotInvoiced,
    });

  } catch (err) {
    console.error('[Shipments] GET error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ─── POST: Convert SO to Invoice ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { salesorder_ids } = body as { salesorder_ids: string[] };

    if (!salesorder_ids?.length) {
      return NextResponse.json({ error: 'salesorder_ids required' }, { status: 400 });
    }

    const results: Array<{
      salesorder_id: string;
      salesorder_number: string;
      success: boolean;
      invoice_id?: string;
      invoice_number?: string;
      error?: string;
    }> = [];

    for (const soId of salesorder_ids) {
      try {
        const soDetail = await zohoGet('/salesorders/' + soId);
        const so = soDetail.salesorder;
        if (!so) throw new Error('Sales Order not found');

        const soNumber = String(so.salesorder_number || soId);
        if (String(so.status) === 'void') throw new Error('Sales Order is voided');
        if (String(so.invoiced_status) === 'invoiced') throw new Error('Already fully invoiced');

        // Find latest delivery date from delivered shipments on this SO
        let deliveredDate = '';
        if (so.packages?.length) {
          for (const pkg of so.packages) {
            if (pkg.shipment_id) {
              try {
                const shipDetail = await zohoGet('/shipmentorders/' + pkg.shipment_id);
                const ship = shipDetail.shipmentorder;
                if (String(ship?.status) === 'delivered') {
                  const d = String(ship?.delivery_date || ship?.date || '');
                  if (!deliveredDate || d > deliveredDate) deliveredDate = d;
                }
              } catch { /* continue */ }
            }
          }
        }

        if (!deliveredDate) deliveredDate = String(so.delivery_date || so.shipment_date || so.date || '');
        if (!deliveredDate) throw new Error('Cannot determine delivered date');

        // Convert using Zoho's fromsalesorder endpoint
        const token = await getZohoAccessToken();
        const base = getZohoApiBaseUrl();
        const orgId = getZohoOrgId();
        const url = base + '/invoices/fromsalesorder?salesorder_id=' + soId + '&organization_id=' + orgId;

        const convertRes = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: 'Zoho-oauthtoken ' + token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ date: deliveredDate }),
        });
        const invRes = await convertRes.json();
        if (!convertRes.ok) throw new Error('Zoho ' + convertRes.status + ': ' + JSON.stringify(invRes));

        const inv = invRes.invoice || (invRes.invoices && invRes.invoices[0]) || {};
        results.push({
          salesorder_id: soId,
          salesorder_number: soNumber,
          success: true,
          invoice_id: String(inv.invoice_id || ''),
          invoice_number: String(inv.invoice_number || ''),
        });

      } catch (e) {
        results.push({
          salesorder_id: soId,
          salesorder_number: soId,
          success: false,
          error: String(e),
        });
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