// ─── Lamitak size resolution ─────────────────────────────────────────────────────
// Brief section 6. The resolved Zoho item's own name is authoritative (each
// size variant is a distinct real SKU, not a computed property) — the digit-
// count rule below is only a disambiguation SIGNAL for when a customer's code
// doesn't resolve to one exact item and candidates differ by size. Spot-
// checked against real data: "ATP 11358M" (5 digits) -> "4'x10'"; "ART
// 1009XM" (4 digits) -> "4'x8'" — both hold.

export type LamitakSize = '4x8' | '4x10';

/** Authoritative — the resolved item's own name already states its size as text. */
export function extractSizeFromItemName(name: string): LamitakSize | null {
  if (/4\s*'?\s*x\s*10\s*'?/i.test(name)) return '4x10';
  if (/4\s*'?\s*x\s*8\s*'?/i.test(name)) return '4x8';
  return null;
}

// Brief section 6: an explicit customer-stated size always overrides digit inference.
const SIZE_4X10_STATEMENT_PATTERN = /\b(3\s*m(?:eter)?|besar|jumbo|panjang)\b|4\s*'?\s*x\s*10\s*'?/i;
const SIZE_4X8_STATEMENT_PATTERN = /4\s*'?\s*x\s*8\s*'?/i;

/** A size the customer stated directly in their own message — checked before any inference. */
export function detectCustomerStatedSize(text: string): LamitakSize | null {
  if (SIZE_4X10_STATEMENT_PATTERN.test(text)) return '4x10';
  if (SIZE_4X8_STATEMENT_PATTERN.test(text)) return '4x8';
  return null;
}

/** Validated disambiguation-only heuristic — never the primary size source once an item is exactly resolved. */
export function inferSizeFromMotifDigits(digits: string): LamitakSize | null {
  if (digits.length === 4) return '4x8';
  if (digits.length === 5) return '4x10';
  return null;
}

export function extractMotifDigits(code: string): string | null {
  const match = code.match(/(\d{4,5})/);
  return match ? match[1] : null;
}
