import { zohoRequest } from './client';
import {
  assertMirpoZohoLines, MIRPO_REFERENCE, MIRPO_VENDOR_NAME,
  type MirpoDraftLine,
} from '@/lib/purchasing/mirpoZohoContract';

type Row = Record<string, unknown>;

const s = (value: unknown) => String(value || '').trim();
const n = (value: unknown) => Number(value) || 0;

function normalizeVendorName(name: string): string {
  return name.toUpperCase().replace(/[.,]/g, '').replace(/\b(PT|CV)\b/g, '').replace(/\s+/g, ' ').trim();
}

async function resolveMirpoVendorId(): Promise<string> {
  const response = await zohoRequest<{ contacts?: Row[] }>('/contacts', {
    queryParams: { contact_type: 'vendor', per_page: 200 },
  });
  const target = normalizeVendorName(MIRPO_VENDOR_NAME);
  const match = (response.contacts || []).find((contact) => normalizeVendorName(s(contact.contact_name)) === target);
  if (!match?.contact_id) throw new Error(`Vendor "${MIRPO_VENDOR_NAME}" was not found in Zoho Books.`);
  return s(match.contact_id);
}

async function mapBatched<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function run() { while (cursor < items.length) { const index = cursor++; output[index] = await worker(items[index]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

export async function createZohoDraftMirpo(lines: MirpoDraftLine[], localDraftId: string) {
  assertMirpoZohoLines(lines);
  const [vendorId, itemDetails] = await Promise.all([
    resolveMirpoVendorId(),
    mapBatched(lines, 8, async (line) => {
      const response = await zohoRequest<{ item?: Row }>(`/items/${line.item_id}`);
      const item = response.item;
      if (!item) throw new Error(`Zoho item ${line.item_id} was not found.`);
      const brand = s(item.brand || item.cf_brand).toUpperCase();
      const status = s(item.status).toLowerCase();
      if (brand !== 'LAMITAK') throw new Error(`${s(item.name) || line.item_id} is not a LAMITAK item.`);
      if (status && status !== 'active') throw new Error(`${s(item.name) || line.item_id} is not active in Zoho.`);
      return { ...line, rate: Math.max(0, n(item.purchase_rate) || n(item.rate)) };
    }),
  ]);
  const locationId = process.env.ZOHO_LOCATION_HO || '8607767000000093103';
  const jakartaDate = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await zohoRequest<{ purchaseorder?: Row }>('/purchaseorders', {
    method: 'POST',
    retries: 0,
    body: {
      vendor_id: vendorId,
      date: jakartaDate,
      reference_number: MIRPO_REFERENCE,
      notes: `Created from VIA Recommended Next MIRPO draft ${localDraftId}. Review before submitting.`,
      line_items: itemDetails.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
        rate: item.rate,
        location_id: locationId,
      })),
    },
  });
  const po = response.purchaseorder;
  if (!po?.purchaseorder_id) throw new Error('Zoho did not return the created Purchase Order ID.');
  return {
    purchaseorder_id: s(po.purchaseorder_id),
    purchaseorder_number: s(po.purchaseorder_number),
    status: s(po.status) || 'draft',
    vendor_name: s(po.vendor_name) || MIRPO_VENDOR_NAME,
    reference_number: s(po.reference_number) || MIRPO_REFERENCE,
  };
}
