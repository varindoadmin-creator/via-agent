// ─── Item Code Normalization ──────────────────────────────────────────────────
// Handles: DXO5338D = DXO 5338D = DXO 5338 D
// And:     WY5217   = WY 5217

/**
 * Normalize an item code by:
 * 1. Converting to uppercase
 * 2. Removing all internal spaces
 * This creates a canonical key for comparison.
 */
export function normalizeItemCode(code: string): string {
  if (!code) return '';
  return code
    .toUpperCase()
    .replace(/\s+/g, '') // remove all whitespace
    .trim();
}

/**
 * Check if two item codes are equivalent after normalization.
 */
export function itemCodesMatch(a: string, b: string): boolean {
  return normalizeItemCode(a) === normalizeItemCode(b);
}

/**
 * Format an item code in a standard readable format.
 * Inserts a space between the letter prefix and numeric+suffix part.
 * e.g. DXO5338D → DXO 5338D
 */
export function formatItemCode(code: string): string {
  const normalized = normalizeItemCode(code);
  // Match patterns like: 2-4 uppercase letters, followed by digits + optional trailing letters
  const match = normalized.match(/^([A-Z]{2,4})(\d+[A-Z]*)$/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return normalized;
}

/**
 * Build search variants of an item code for fuzzy Zoho search.
 * Returns an array of strings to try in order.
 */
export function buildSearchVariants(code: string): string[] {
  const normalized = normalizeItemCode(code);
  const formatted = formatItemCode(code);
  const variants = new Set<string>([
    normalized,
    formatted,
    code.trim().toUpperCase(),
  ]);
  // Also try with a space before the last letter if ends in letter
  const withSpaceBeforeLastLetter = normalized.replace(/([A-Z])$/, ' $1');
  variants.add(withSpaceBeforeLastLetter.trim());

  return Array.from(variants).filter(Boolean);
}

/**
 * Extract brand prefix from item code.
 * DXO5338D → DXO
 * WY5217   → WY
 * SCT1234D → SCT
 */
export function extractBrandPrefix(code: string): string {
  const normalized = normalizeItemCode(code);
  const match = normalized.match(/^([A-Z]{2,4})\d/);
  return match ? match[1] : '';
}

/**
 * Check if a code is a new collection item based on known prefixes.
 */
const NEW_COLLECTION_PREFIXES = ['TSP', 'TSW', 'ATP', 'ATS', 'CATP', 'CATS'];

export function isNewCollection(code: string): boolean {
  const prefix = extractBrandPrefix(code);
  return NEW_COLLECTION_PREFIXES.includes(prefix);
}

/**
 * Check if a code belongs to a best-selling group.
 */
const BEST_SELLING_GROUPS = ['SCT', 'WY', 'DXO'];

export function isBestSelling(code: string): boolean {
  const prefix = extractBrandPrefix(code);
  return BEST_SELLING_GROUPS.includes(prefix);
}
