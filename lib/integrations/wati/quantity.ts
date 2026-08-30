// ─── Quantity extraction ─────────────────────────────────────────────────────────
// Brief section 11: only extract when reasonably clear. Never forces
// interpretation of ambiguous numbers (e.g. a bare item code containing digits
// is not a quantity).

export interface ExtractedQuantity {
  quantity: number;
  unit: string | null;
}

const UNIT_QUANTITY_PATTERN = /\b(\d+(?:[.,]\d+)?)\s*(lembar|pcs|pieces|buah|unit|dus|box|roll|meter|m2|m²)\b/i;
const VERB_QUANTITY_PATTERN = /\b(?:butuh|mau|perlu|pesan|order)\s+(\d+(?:[.,]\d+)?)\b/i;

export function extractQuantity(text: string): ExtractedQuantity | null {
  const unitMatch = text.match(UNIT_QUANTITY_PATTERN);
  if (unitMatch) {
    const quantity = Number(unitMatch[1].replace(',', '.'));
    if (Number.isFinite(quantity)) return { quantity, unit: unitMatch[2].toLowerCase() };
  }
  const verbMatch = text.match(VERB_QUANTITY_PATTERN);
  if (verbMatch) {
    const quantity = Number(verbMatch[1].replace(',', '.'));
    if (Number.isFinite(quantity)) return { quantity, unit: null };
  }
  return null;
}
