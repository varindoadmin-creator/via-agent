// ─── Special Price policy — internal pricing-group classification ────────────
// VIA Product/Pricing/Company Architecture brief, sections 24-27: a
// deterministic classifier only. This never computes a discount or a price —
// actual dollar pricing remains 100% Zoho-pricebook-driven via
// lib/zoho/customerPricing.ts, unchanged. No discount-percentage matrix is
// invented here since none was approved (brief section 28's own instruction:
// "do not hardcode example percentages unless present in the actual approved
// discount matrix"). This classification is internal-only — never exposed to
// a customer (brief section 24).

export type PricingGroup = 'STANDARD' | 'EDL_SPECIAL' | 'LAMITAK_SPECIAL';

// Brief section 25.
const EDL_SPECIAL_PREFIXES = ['DC', 'DS', 'DSD', 'DSF', 'DSL', 'DSW', 'DV', 'DWL', 'DWV', 'ESS', 'EST', 'L-FA'];
// Brief section 26.
const LAMITAK_SPECIAL_PREFIXES = ['ARTE', 'ART', 'CC', 'CCM', 'CCP', 'CCX', 'ATS', 'ATP', 'ATW', 'CATS', 'CATP'];

function normalizeForPrefixMatch(code: string): string {
  return (code || '').toUpperCase().replace(/[\s-]+/g, '');
}

/**
 * Brief section 27: longest-prefix-first matching so overlapping prefixes
 * (ARTE vs ART, CCM/CCP/CCX vs CC) resolve to the more specific one — never
 * naive substring/startsWith-in-list-order logic.
 */
function matchesLongestPrefix(normalizedCode: string, prefixes: string[]): boolean {
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);
  for (const prefix of sorted) {
    if (normalizedCode.startsWith(normalizeForPrefixMatch(prefix))) return true;
  }
  return false;
}

/**
 * Classifies an item code into its internal pricing group. Checks the more
 * specific brand lists independently — a code cannot simultaneously match
 * both EDL and Lamitak special prefixes in practice, but if it somehow did,
 * the first (EDL) check wins deterministically rather than being ambiguous.
 */
export function classifyPricingGroup(itemCode: string): PricingGroup {
  const normalized = normalizeForPrefixMatch(itemCode);
  if (!normalized) return 'STANDARD';
  if (matchesLongestPrefix(normalized, EDL_SPECIAL_PREFIXES)) return 'EDL_SPECIAL';
  if (matchesLongestPrefix(normalized, LAMITAK_SPECIAL_PREFIXES)) return 'LAMITAK_SPECIAL';
  return 'STANDARD';
}
