// ─── Varindo website message parser ────────────────────────────────────────────
// Deterministic recognition of the two known website-generated WhatsApp prefill
// formats (brief section 7). The displayed price is customer-provided/inbound
// context ONLY — never authoritative business pricing (brief section 7's
// explicit warning). If VIA ever needs to quote/confirm price, it must use the
// official Zoho pricing service, not this value.

export interface WebsiteStructuredProduct {
  productCode: string;
  productName: string;
  displayedPrice: number | null;
  displayedPriceIncludesTax: boolean;
}

const WEBSITE_PREFIX = /^halo admin varindo,/i;

/** Recognizes the generic website prefill prefix, even without a structured product block. */
export function isWebsiteGeneratedMessage(text: string): boolean {
  return WEBSITE_PREFIX.test(text.trim());
}

/**
 * Parses the structured "Produk: ... / Kode: ... / Harga: ..." block. Returns
 * null if the message doesn't contain a recognizable Kode line — never guesses
 * a partial extraction.
 */
export function parseWebsiteStructuredProduct(text: string): WebsiteStructuredProduct | null {
  const kodeMatch = text.match(/kode\s*:\s*(.+)/i);
  if (!kodeMatch) return null;
  const productCode = kodeMatch[1].trim().split('\n')[0].trim();
  if (!productCode) return null;

  const produkMatch = text.match(/produk\s*:\s*(.+)/i);
  let productName = produkMatch ? produkMatch[1].trim().split('\n')[0].trim() : '';
  // "Produk: ATP 11358M - LAMITAK HPL 4'x10' | MARMO CLASSICO PRO" — strip the
  // leading "<code> - " prefix so productName is just the descriptive part.
  const dashSplit = productName.match(/^\S+(?:\s\S+)?\s*-\s*(.+)$/);
  if (dashSplit && productName.toUpperCase().startsWith(productCode.toUpperCase())) {
    productName = dashSplit[1].trim();
  }

  const hargaMatch = text.match(/harga\s*:\s*rp\.?\s*([\d.,]+)/i);
  const displayedPrice = hargaMatch ? Number(hargaMatch[1].replace(/[.,]/g, '')) : null;
  const displayedPriceIncludesTax = /termasuk\s+ppn/i.test(text);

  return {
    productCode,
    productName,
    displayedPrice: displayedPrice && Number.isFinite(displayedPrice) ? displayedPrice : null,
    displayedPriceIncludesTax,
  };
}
