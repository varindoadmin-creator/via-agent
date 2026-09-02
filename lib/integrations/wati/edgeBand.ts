// ─── Edge-band ("edging"/"newedge") discovery + verification ─────────────────
// 2026-09-02, per explicit instruction: the matching edge-band code for a
// panel is discovered from the public brand website — varindo.co.id
// (Lamitak) / varindohpl.com (EDL) — since each product page already lists
// it directly (verified against real pages, e.g. varindo.co.id's DXO 5338D
// page shows "Newedge Code (23mm Width): EAP5338R0V2/2310/1" and the 44mm
// variant; varindohpl.com's DWT 3773W page shows an embedded
// `"edgebandCode":"EW 03773D","edgebandSizes":["23 x 1.0mm","45 x 1.0mm"]`).
//
// The website is NEVER trusted as a source of price or of "this size is
// actually available" — every candidate code it surfaces is re-searched in
// Zoho (this file's whole reason for existing), and only a code Zoho itself
// returns is ever passed back. Two real, confirmed cases this matters for:
// the website's Lamitak code has trailing digits Zoho doesn't recognize
// verbatim ("EAP5338R0V2/2310/1" - Zoho only has "EAP5338R0V2/23"), and the
// EDL website lists two compatible widths per product but Zoho may only
// carry one of them as a real orderable item right now — the website's list
// is "designed to fit", not "in stock as an SKU today".
//
// Falls back to productResolution.ts's findEdgeBandVariants() (a pure-Zoho
// name cross-reference, no website involved) if the site is unreachable or
// its markup has changed, so a scraper hiccup never turns a real "yes" into
// a false "not available" — see resolveEdgeBandForProduct().

import { searchItems } from '../../zoho/items.ts';
import { findEdgeBandVariants } from './productResolution.ts';
import type { ZohoItem } from '../../../types/zoho.ts';

const FETCH_TIMEOUT_MS = 5000;
const SITE_FOR_BRAND: Record<'LAMITAK' | 'EDL', string> = {
  LAMITAK: 'https://varindo.co.id',
  EDL: 'https://varindohpl.com',
};

async function fetchWithTimeout(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VIA-Jarvis/1.0)' } });
    clearTimeout(timeout);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Search results list each product card as
 * `<a aria-label="DXO 5338D - LAMITAK HPL 4'x8' | STOFFA GRIGIO" ... href="/products/dxo-5338d-stoffa-grigio">`
 * — the aria-label carries the same "<code> - ..." shape Zoho item names do,
 * so matching its leading code against our resolved item's own leading code
 * picks the exact right card even when the search also surfaces a
 * same-motif sibling (e.g. searching "5338" also matches the 4x10 "DXO
 * 15338D" card) rather than trusting "first result".
 */
function findProductSlug(html: string, wantedCode: string): string | null {
  const pattern = /aria-label="([^"]+)"[^>]*href="\/products\/([a-z0-9-]+)"/g;
  const wanted = normalizeCode(wantedCode.split(' - ')[0]);
  let m: RegExpExecArray | null;
  let firstSlug: string | null = null;
  while ((m = pattern.exec(html))) {
    const label = m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    const slug = m[2];
    if (!firstSlug) firstSlug = slug;
    if (normalizeCode(label.split(' - ')[0]) === wanted) return slug;
  }
  return firstSlug;
}

/** Lamitak's product page lists a full per-width code in <dt>/<dd> pairs — the trailing digits after the 2-digit width are unrelated page metadata, dropped rather than guessed at (confirmed: Zoho only recognizes the code up to that point). */
function extractLamitakCodes(html: string): string[] {
  const codes: string[] = [];
  const pattern = /Newedge Code \(\d+mm Width\)<\/dt><dd[^>]*>([^<]+)<\/dd>/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html))) {
    const cleaned = m[1].match(/^([A-Z]+\d+[A-Z0-9]*\/\d{2})/);
    if (cleaned) codes.push(cleaned[1]);
  }
  return codes;
}

/**
 * EDL's page embeds one base edgeband code (no width suffix) plus a list of
 * design-compatible widths — the base code alone is what gets searched in
 * Zoho; which width(s) actually resolve there is the real availability
 * answer, not this list. Confirmed by direct fetch (2026-09-02): this page
 * sometimes serves the field as a literal `"edgebandCode":"EW 03773D"` and
 * sometimes as an escaped `\"edgebandCode\":\"EW 03773D\"` (embedded inside
 * a serialized RSC payload string) depending on the request — the optional
 * backslashes here match both.
 */
function extractEdlCode(html: string): string | null {
  const match = html.match(/\\?"edgebandCode\\?":\\?"([^"\\]+)\\?"/);
  return match ? match[1] : null;
}

async function discoverCandidateCodes(brand: 'LAMITAK' | 'EDL', itemLabel: string): Promise<string[]> {
  const site = SITE_FOR_BRAND[brand];
  const searchQuery = itemLabel.split(' - ')[0].trim();
  const searchHtml = await fetchWithTimeout(`${site}/products?search=${encodeURIComponent(searchQuery)}`);
  if (!searchHtml) return [];
  const slug = findProductSlug(searchHtml, itemLabel);
  if (!slug) return [];
  const productHtml = await fetchWithTimeout(`${site}/products/${slug}`);
  if (!productHtml) return [];
  return brand === 'LAMITAK' ? extractLamitakCodes(productHtml) : [extractEdlCode(productHtml)].filter((c): c is string => !!c);
}

/**
 * Returns the real, live Zoho items for every edge-band candidate the brand
 * website lists for this product — keeping only what Zoho itself confirms
 * exists (never the raw website code/size list). Falls back to
 * findEdgeBandVariants() if the website yields nothing at all (unreachable,
 * no product page found, or markup changed).
 */
export async function resolveEdgeBandForProduct(product: ZohoItem, brand: 'LAMITAK' | 'EDL' | null): Promise<ZohoItem[]> {
  if (brand) {
    const candidates = await discoverCandidateCodes(brand, product.name).catch(() => []);
    if (candidates.length > 0) {
      const found = new Map<string, ZohoItem>();
      for (const code of candidates) {
        const results = await searchItems(code, 3).catch(() => []);
        for (const item of results) if (!found.has(item.item_id)) found.set(item.item_id, item);
      }
      if (found.size > 0) return Array.from(found.values());
    }
  }
  return findEdgeBandVariants(product);
}
