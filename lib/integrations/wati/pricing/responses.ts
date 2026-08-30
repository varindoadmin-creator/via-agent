// ─── Price response templates ───────────────────────────────────────────────────
// Brief sections 22/25/29. Fixed Bahasa Indonesia templates only — same
// no-LLM-generation posture as every other WATI customer-facing response.
// None of these functions accept a raw internal figure (cost/margin/discount
// floor) as a parameter — only the already-computed customer-safe amount.

function itemLabel(itemCode: string | null, itemName: string): string {
  return itemCode || itemName;
}

export function priceOnly(itemCode: string | null, itemName: string, formattedPrice: string): string {
  return `Untuk ${itemLabel(itemCode, itemName)}, harga saat ini ${formattedPrice} termasuk PPN.`;
}

/** Existence/quantity-specific stock question combined with price (brief section 21). */
export function priceWithStockAck(itemCode: string | null, itemName: string, formattedPrice: string): string {
  return `${priceOnly(itemCode, itemName, formattedPrice)}\n\nUntuk ketersediaan stok, kami bantu cek terlebih dahulu ya Pak/Bu.`;
}

/** Count-inquiry-shaped stock question combined with price (brief section 22). */
export function priceWithNeedQuantity(itemCode: string | null, itemName: string, formattedPrice: string): string {
  return `${priceOnly(itemCode, itemName, formattedPrice)}\n\nUntuk ketersediaan stok, boleh diinformasikan berapa lembar yang dibutuhkan? Kami bantu cek ketersediaannya.`;
}

export function needsSizeClarification(): string {
  return 'Baik Pak/Bu, untuk memastikan harga yang tepat, apakah yang dibutuhkan ukuran 4x8 atau 4x10?';
}

export function priceNotFound(): string {
  return 'Baik Pak/Bu, harga untuk produk tersebut perlu kami konfirmasi terlebih dahulu. Kami bantu teruskan ke Admin Varindo.';
}

/** "Lamitak harganya berapa?" — too broad, never invent a single brand-wide price. */
export function broadBrandPriceClarification(): string {
  return 'Baik Pak/Bu. Boleh dibantu informasikan kode atau motif Lamitak yang dimaksud? Jika ada, Bapak/Ibu juga dapat mengirimkan foto produknya.';
}

/** "Bisa kurang?" / bulk project pricing — human/Sales handoff, no discount-floor exposure. */
export function discountHandoff(): string {
  return 'Baik Pak/Bu, untuk permintaan harga khusus kami bantu teruskan ke Admin/Sales Varindo.';
}
