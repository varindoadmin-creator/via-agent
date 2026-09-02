// ─── Quantity extraction ─────────────────────────────────────────────────────────
// Brief section 11: only extract when reasonably clear. Never forces
// interpretation of ambiguous numbers (e.g. a bare item code containing digits
// is not a quantity).

export interface ExtractedQuantity {
  quantity: number;
  unit: string | null;
}

// 2026-09-02: "lembar/sheet/lbr/lb" always refer to HPL panels; "m/meter/
// mtr/roll" always refer to edge band (explicit vocabulary given directly,
// not inferred) — SHEET_UNITS/EDGE_BAND_UNITS below are the single source
// of truth for that classification, reused by isSheetUnit()/isEdgeBandUnit()
// so pipeline.ts can tell "Bisa beli 15 meter?" apart from "...1 lembar?"
// even when the carried product context is ambiguous between the two.
const UNIT_QUANTITY_PATTERN = /\b(\d+(?:[.,]\d+)?)\s*(lembar|sheet|lbr|lb|pcs|pieces|buah|unit|dus|box|roll|meter|mtr|m2|m²|m)\b/i;
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

const SHEET_UNITS = new Set(['lembar', 'sheet', 'lbr', 'lb']);
const EDGE_BAND_UNITS = new Set(['m', 'meter', 'mtr', 'roll']);

/** True for a unit word that only ever refers to HPL panels ("lembar"/"sheet"/"lbr"/"lb"). */
export function isSheetUnit(unit: string | null): boolean {
  return unit ? SHEET_UNITS.has(unit.toLowerCase()) : false;
}

/** True for a unit word that only ever refers to edge band ("m"/"meter"/"mtr"/"roll" — a roll is 100 meters, still an edge-band-only unit). */
export function isEdgeBandUnit(unit: string | null): boolean {
  return unit ? EDGE_BAND_UNITS.has(unit.toLowerCase()) : false;
}
