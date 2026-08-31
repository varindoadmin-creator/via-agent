// ─── Source attribution ───────────────────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 7-8, 70-72, 96: reads
// Phase 2's own `source` field verbatim (WEBSITE/GOOGLE_ADS/DIRECT_WHATSAPP/
// UNKNOWN, lib/integrations/wati/source.ts) — never infers a channel beyond
// what that field already recorded. UNKNOWN is never attributed to, or
// ranked as, a marketing source.

export type AttributedSource = 'WEBSITE' | 'GOOGLE_ADS' | 'DIRECT_WHATSAPP';
export type AttributionConfidence = 'CONFIRMED' | 'INFERRED' | 'UNKNOWN';

const KNOWN_SOURCES: readonly AttributedSource[] = ['WEBSITE', 'GOOGLE_ADS', 'DIRECT_WHATSAPP'];

export function attributionConfidenceFor(source: string | null | undefined): AttributionConfidence {
  if (!source) return 'UNKNOWN';
  return (KNOWN_SOURCES as readonly string[]).includes(source) ? 'CONFIRMED' : 'UNKNOWN';
}

export interface SourcePerformanceRow {
  source: string;
  leads: number;
  inquiries: number;
  quotations: number;
  orders: number;
  soValue: number;
}

/** Brief section 70: never rank UNKNOWN as a meaningful marketing source — it's reported separately, not folded into the ranked list. */
export function splitKnownAndUnknownSources(rows: SourcePerformanceRow[]): { known: SourcePerformanceRow[]; unknown: SourcePerformanceRow | null } {
  const known = rows.filter(r => (KNOWN_SOURCES as readonly string[]).includes(r.source));
  const unknown = rows.find(r => !(KNOWN_SOURCES as readonly string[]).includes(r.source)) ?? null;
  return { known, unknown };
}
