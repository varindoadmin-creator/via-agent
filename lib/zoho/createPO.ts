// ─── Create PO — brand-batched Purchase Order generation ──────────────────────
// "Create PO" button on /purchases. For a chosen brand, finds every item of
// unmet demand from computeApprovalData()'s uncovered_demand (Confirmed SOs not
// yet at "Ordered"/"Stock Ready" sub-status, netted against stock on hand and
// any PO already in flight — see poApprovalEngine.ts), groups it by warehouse,
// and raises one Draft Purchase Order per warehouse with real demand. Admin
// reviews/revises in Zoho before submitting for approval — nothing here skips
// the existing Pending Approval gate.
// Server-side only. Never import in client components.

import { zohoRequest } from '@/lib/zoho/client';
import { computeApprovalData, type UncoveredDemand } from '@/lib/zoho/poApprovalEngine';

function s(value: unknown): string {
  return value == null ? '' : String(value);
}
function n(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function mapBatched<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

// Brand -> Vendor, exactly as Admin defined it. Deliberately not derived from
// the item's own vendor_name in Zoho: several brands (EDL, TACO) have items
// split across more than one vendor_name in Zoho's item records, but Admin
// wants every PO for a given brand routed to one specific vendor.
export interface BrandVendor { brand: string; vendor_name: string }
export const BRAND_VENDORS: BrandVendor[] = [
  { brand: 'EDL',        vendor_name: 'EDL DESIGN INDONESIA, PT' },
  { brand: 'LAMITAK',    vendor_name: 'TAK PRODUCTS AND SERVICES, PT' },
  { brand: 'AICA',       vendor_name: 'MARGA BHARATA, PT' },
  { brand: 'TACO',       vendor_name: 'WIRYA INDAH NUGRAHA, PT' },
  { brand: 'CARTA',      vendor_name: 'LOGAM MAS INTERNASIONAL, PT' },
  { brand: 'GRASMERINO', vendor_name: 'GRASINDO ANUGRAH PRATAMA, PT' },
  { brand: 'GREENLAM',   vendor_name: 'MATT GLOSS MATTER, PT' },
];

function getLocationIds(): Record<string, string> {
  return {
    'HEAD OFFICE': process.env.ZOHO_LOCATION_HO  || '8607767000000093103',
    'HUB-BDG':     process.env.ZOHO_LOCATION_BDG || '8607767000000093565',
    'HUB-MDN':     process.env.ZOHO_LOCATION_MDN || '8607767000000221577',
  };
}

// Vendor names in code vs Zoho contacts can drift on the legal-entity suffix
// (e.g. "WIRYA INDAH NUGRAHA, PT" here vs "WIRYA INDAH NUGRAHA, CV" in Zoho) —
// match on the core name, ignoring PT/CV/punctuation.
function normalizeVendorName(name: string): string {
  return name.toUpperCase().replace(/[.,]/g, '').replace(/\b(PT|CV)\b/g, '').replace(/\s+/g, ' ').trim();
}

async function resolveVendorId(vendorName: string): Promise<string | null> {
  const res = await zohoRequest<{ contacts?: Record<string, unknown>[] }>('/contacts', {
    queryParams: { contact_type: 'vendor', per_page: 200 },
  });
  const contacts = res.contacts || [];
  const target = normalizeVendorName(vendorName);
  const match = contacts.find(c => normalizeVendorName(s(c.contact_name)) === target);
  return match ? s(match.contact_id) : null;
}

interface ItemPurchaseInfo {
  brand: string;
  unit: string;
  purchase_rate: number;
}

async function fetchItemPurchaseInfo(itemId: string): Promise<ItemPurchaseInfo | null> {
  try {
    const res = await zohoRequest<{ item?: Record<string, unknown> }>(`/items/${itemId}`);
    const item = res.item;
    if (!item) return null;
    return {
      brand: s(item.brand).toUpperCase(),
      unit: s(item.unit) || 'sht',
      purchase_rate: n(item.purchase_rate) || n(item.rate),
    };
  } catch {
    return null;
  }
}

interface EnrichedDemand extends UncoveredDemand {
  brand: string;
  unit: string;
  purchase_rate: number;
  location_id: string;
}

async function enrichDemand(demand: UncoveredDemand[]): Promise<EnrichedDemand[]> {
  const locationIds = getLocationIds();
  const uniqueItemIds = Array.from(new Set(demand.map(d => d.item_id).filter(Boolean)));
  const infos = await mapBatched(uniqueItemIds, 8, fetchItemPurchaseInfo);
  const infoByItem = new Map<string, ItemPurchaseInfo>();
  uniqueItemIds.forEach((id, idx) => { const info = infos[idx]; if (info) infoByItem.set(id, info); });

  return demand
    .filter(d => d.item_id && infoByItem.has(d.item_id))
    .map(d => {
      const info = infoByItem.get(d.item_id)!;
      return {
        ...d,
        brand: info.brand,
        unit: info.unit,
        purchase_rate: info.purchase_rate,
        location_id: locationIds[d.location_name] || '',
      };
    })
    .filter(d => d.location_id);
}

export interface CreatePOLinePreview {
  item_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  rate: number;
  covers: Array<{ salesorder_number: string; customer_name: string; qty: number }>;
}

export interface CreatePOHubResult {
  location_name: string;
  purchaseorder_id?: string;
  purchaseorder_number?: string;
  line_items: CreatePOLinePreview[];
  total: number;
  error?: string;
}

export interface CreatePOSummary {
  brand: string;
  vendor_name: string;
  hubs: CreatePOHubResult[];
}

/**
 * Compute (but do not create) the per-hub draft PO plan for a brand — the
 * quantities that still need purchasing, grouped by item then by warehouse.
 * Used both to preview and as the input to createDraftPOsForBrand().
 */
async function buildPlanForBrand(brand: string): Promise<Map<string, CreatePOHubResult>> {
  const { uncovered_demand } = await computeApprovalData();
  const enriched = await enrichDemand(uncovered_demand);
  const brandDemand = enriched.filter(d => d.brand === brand.toUpperCase());

  const byHub = new Map<string, EnrichedDemand[]>();
  for (const d of brandDemand) {
    if (!byHub.has(d.location_name)) byHub.set(d.location_name, []);
    byHub.get(d.location_name)!.push(d);
  }

  const plan = new Map<string, CreatePOHubResult>();
  for (const [locationName, entries] of byHub) {
    const byItem = new Map<string, EnrichedDemand[]>();
    for (const e of entries) {
      if (!byItem.has(e.item_id)) byItem.set(e.item_id, []);
      byItem.get(e.item_id)!.push(e);
    }

    const line_items: CreatePOLinePreview[] = Array.from(byItem.entries())
      .map(([itemId, group]) => ({
        item_id: itemId,
        name: group[0].name,
        sku: group[0].sku,
        quantity: group.reduce((sum, g) => sum + g.qty, 0),
        unit: group[0].unit,
        rate: group[0].purchase_rate,
        covers: group.map(g => ({ salesorder_number: g.salesorder_number, customer_name: g.customer_name, qty: g.qty })),
      }))
      .filter(li => li.quantity > 0);

    if (line_items.length === 0) continue;

    plan.set(locationName, {
      location_name: locationName,
      line_items,
      total: line_items.reduce((sum, li) => sum + li.quantity * li.rate, 0),
    });
  }
  return plan;
}

function jakartaToday(): string {
  const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
  return new Date(Date.now() + JAKARTA_OFFSET_MS).toISOString().split('T')[0];
}

/**
 * Create one Draft Purchase Order per warehouse (HEAD OFFICE / HUB-BDG / HUB-MDN)
 * that has unmet demand for the given brand. VIA never orders more than the net
 * shortfall — stock on hand and PO quantity already in flight are already
 * subtracted out by computeApprovalData()'s uncovered_demand.
 */
export async function createDraftPOsForBrand(brand: string): Promise<CreatePOSummary> {
  const bv = BRAND_VENDORS.find(b => b.brand === brand.toUpperCase());
  if (!bv) throw new Error(`Unknown brand: ${brand}`);

  const plan = await buildPlanForBrand(bv.brand);
  if (plan.size === 0) {
    return { brand: bv.brand, vendor_name: bv.vendor_name, hubs: [] };
  }

  const vendorId = await resolveVendorId(bv.vendor_name);
  if (!vendorId) throw new Error(`Vendor "${bv.vendor_name}" not found among Zoho vendor contacts.`);

  const date = jakartaToday();
  const hubs: CreatePOHubResult[] = [];

  for (const [locationName, hubPlan] of plan) {
    const locationId = getLocationIds()[locationName];
    try {
      const res = await zohoRequest<{ purchaseorder?: Record<string, unknown> }>('/purchaseorders', {
        method: 'POST',
        body: {
          vendor_id: vendorId,
          date,
          line_items: hubPlan.line_items.map(li => ({
            item_id: li.item_id,
            rate: li.rate,
            quantity: li.quantity,
            location_id: locationId,
          })),
        },
      });
      const po = res.purchaseorder;
      hubs.push({
        location_name: locationName,
        purchaseorder_id: po ? s(po.purchaseorder_id) : undefined,
        purchaseorder_number: po ? s(po.purchaseorder_number) : undefined,
        line_items: hubPlan.line_items,
        total: hubPlan.total,
      });
    } catch (e) {
      hubs.push({
        location_name: locationName,
        line_items: hubPlan.line_items,
        total: hubPlan.total,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { brand: bv.brand, vendor_name: bv.vendor_name, hubs };
}
