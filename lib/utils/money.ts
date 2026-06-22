// ─── Money / Currency Utilities ───────────────────────────────────────────────

/**
 * Format a number as Indonesian Rupiah.
 * e.g. 125000 → "Rp 125.000"
 */
export function formatRupiah(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'N/A';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a number with thousand separators (no currency symbol).
 * e.g. 125000 → "125.000"
 */
export function formatNumber(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'N/A';
  return new Intl.NumberFormat('id-ID').format(amount);
}

/**
 * Parse a price string that may contain currency symbols or separators.
 * Handles: "Rp 125.000", "125,000", "125000", "125.000,50"
 */
export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;

  // Remove currency symbols and whitespace
  let cleaned = raw.replace(/[Rp\s]/gi, '').trim();

  // Indonesian format: dots as thousand separator, comma as decimal
  // e.g. "125.000,50" → 125000.50
  if (cleaned.match(/\./g)?.length === 1 && cleaned.includes(',')) {
    // Could be "125.000,50" format
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.match(/,/g)?.length === 1 && !cleaned.includes('.')) {
    // Could be "125,000" format (US style)
    cleaned = cleaned.replace(',', '');
  } else {
    // Remove all dots that look like thousand separators
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Calculate subtotal from items.
 */
export function calculateSubtotal(
  items: Array<{ quantity: number; official_price: number | null }>
): number {
  return items.reduce((sum, item) => {
    if (item.official_price === null) return sum;
    return sum + item.quantity * item.official_price;
  }, 0);
}

/**
 * Format price difference as percentage.
 */
export function priceDiffPercent(official: number, customerProvided: number): string {
  if (!official || !customerProvided) return 'N/A';
  const diff = ((customerProvided - official) / official) * 100;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}%`;
}
