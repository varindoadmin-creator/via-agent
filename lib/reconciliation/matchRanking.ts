export type RankedInvoiceMatch = {
  type: 'single' | 'multi';
  match_score: number;
  amount_score?: number;
};

/**
 * Prefer the strongest score. When scores are effectively tied, an exact
 * single-invoice amount is more specific and safer than a combination that
 * happens to add up to the same bank credit.
 */
export function compareInvoiceMatches(a: RankedInvoiceMatch, b: RankedInvoiceMatch): number {
  const scoreDifference = b.match_score - a.match_score;
  if (Math.abs(scoreDifference) >= 0.01) return scoreDifference;

  const aExactSingle = a.type === 'single' && a.amount_score === 1;
  const bExactSingle = b.type === 'single' && b.amount_score === 1;
  if (aExactSingle !== bExactSingle) return aExactSingle ? -1 : 1;

  if (a.type !== b.type) return a.type === 'single' ? -1 : 1;
  return scoreDifference;
}
