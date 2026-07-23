// ─── Aging Undelivered Package detection ────────────────────────────────────
// This org marks a package `status: 'shipped'` the moment it's dispatched —
// that flag never reflects whether it actually arrived (delivery completion
// is tracked at the shipmentorder level, not the package level, and most
// packages here never even reach `status: 'not_shipped'` at all; they go
// straight to 'shipped' on dispatch). So "stuck due to traffic" shows up as
// a package sitting at status 'shipped' for more than a day, not as
// 'not_shipped' — same "active package" definition already used for the
// Pending Delivery table on app/inventory/shipments/page.tsx (packages with
// status 'shipped' OR 'not_shipped' both count as not-yet-delivered).
// Checked every morning so today's failures surface the next day, not days
// later. Server-side only.

import { zohoRequest } from '@/lib/zoho/client';

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Jakarta is a fixed UTC+7, no DST.

export interface AgingPackage {
  package_id: string;
  package_number: string;
  salesorder_id: string;
  salesorder_number: string;
  customer_name: string;
  status: string; // 'shipped' | 'not_shipped' — Zoho package status
  date: string; // shipment_date (preferred) or package creation date — the "should have arrived by now" reference
  days_aging: number;
  tracking_number: string;
  carrier: string;
}

function jakartaDateStr(d: Date): string {
  return new Date(d.getTime() + JAKARTA_OFFSET_MS).toISOString().split('T')[0];
}

function daysBetweenJakarta(fromDateStr: string, today: string): number {
  const from = new Date(`${jakartaDateStr(new Date(fromDateStr))}T00:00:00Z`);
  const to = new Date(`${today}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

async function fetchPackagesByStatus(status: 'shipped' | 'not_shipped'): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    try {
      const res = await zohoRequest<Record<string, unknown>>('/packages', {
        queryParams: { status, per_page: 200, page, sort_column: 'date', sort_order: 'A' },
      });
      const batch = (res.packages || []) as Record<string, unknown>[];
      items.push(...batch);
      hasMore = batch.length === 200;
      page++;
      if (page > 10) break;
    } catch (err) {
      // Some Zoho orgs 1000-error on this filter combo — same tolerance as app/api/shipments/route.ts.
      console.warn(`[ShipmentAging] Skipping /packages?status=${status}:`, err);
      return items;
    }
  }
  return items;
}

/** Active (not-yet-delivered) packages — 'shipped' or 'not_shipped' — a day or more past their dispatch/creation date. */
export async function findAgingUndeliveredPackages(): Promise<AgingPackage[]> {
  const [shipped, notShipped] = await Promise.all([
    fetchPackagesByStatus('shipped'),
    fetchPackagesByStatus('not_shipped'),
  ]);
  const today = jakartaDateStr(new Date());

  const aging = [...shipped, ...notShipped]
    .map((p): AgingPackage | null => {
      const date = String(p.shipment_date || p.date || '');
      if (!date) return null;
      const daysAging = daysBetweenJakarta(date, today);
      if (daysAging < 1) return null;
      return {
        package_id: String(p.package_id || ''),
        package_number: String(p.package_number || ''),
        salesorder_id: String(p.salesorder_id || ''),
        salesorder_number: '',
        customer_name: '',
        status: String(p.status || ''),
        date,
        days_aging: daysAging,
        tracking_number: String(p.tracking_number || ''),
        carrier: String(p.carrier || ''),
      };
    })
    .filter((p): p is AgingPackage => p !== null);

  if (aging.length === 0) return aging;

  // Small set expected — fine to fetch each SO individually rather than
  // paginating the full confirmed-SO list just for name lookups.
  const soIds = Array.from(new Set(aging.map(p => p.salesorder_id))).filter(Boolean);
  const soMap = new Map<string, { salesorder_number: string; customer_name: string }>();
  await Promise.all(soIds.map(async id => {
    try {
      const res = await zohoRequest<{ salesorder?: Record<string, unknown> }>(`/salesorders/${id}`);
      const so = res.salesorder;
      if (so) soMap.set(id, { salesorder_number: String(so.salesorder_number || ''), customer_name: String(so.customer_name || '') });
    } catch {
      // Leave blank — still report the package even if the SO lookup fails.
    }
  }));

  for (const p of aging) {
    const so = soMap.get(p.salesorder_id);
    if (so) {
      p.salesorder_number = so.salesorder_number;
      p.customer_name = so.customer_name;
    }
  }

  return aging.sort((a, b) => b.days_aging - a.days_aging);
}
