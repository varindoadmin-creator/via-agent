// ─── Brand ↔ Vendor mapping ────────────────────────────────────────────────────
// Canonical source, originally defined in lib/zoho/createPO.ts (still re-exported
// there for existing importers). Brand -> Vendor, exactly as Admin defined it for
// PO routing. Deliberately not treated as a clean reverse (vendor_name -> brand)
// map: several brands (EDL, TACO) have items split across more than one
// vendor_name in Zoho's item records, so a vendor_name match here is only ever
// used as a positive confirmation, never an exhaustive lookup — no match means
// "brand unresolved", not "guess the closest one".

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

const KNOWN_BRANDS = BRAND_VENDORS.map(b => b.brand);

/**
 * Best-effort, confirmation-only brand lookup from a resolved Zoho item's own
 * `vendor_name`. Returns null (unresolved) rather than guessing when there's
 * no exact match — see the module comment on why this is deliberately not
 * exhaustive.
 */
export function resolveBrandForVendorName(vendorName: string | undefined | null): string | null {
  if (!vendorName) return null;
  const match = BRAND_VENDORS.find(b => b.vendor_name.toLowerCase() === vendorName.trim().toLowerCase());
  return match?.brand ?? null;
}

/**
 * Deterministic detection of a known brand name mentioned directly in customer
 * text (e.g. "saya ingin bertanya tentang produk Lamitak"). This is the
 * primary, reliable brand signal for Phase 2 — a customer naming a brand is
 * unambiguous, unlike inferring brand from an item code prefix (no authoritative
 * prefix -> brand table exists in VIA's data today).
 */
export function detectBrandMention(text: string): string | null {
  const upper = text.toUpperCase();
  for (const brand of KNOWN_BRANDS) {
    if (upper.includes(brand)) return brand;
  }
  return null;
}
