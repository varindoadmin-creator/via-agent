// ─── Percentage-based rollout ──────────────────────────────────────────────────
// VIA Phase 13, brief section 26: a FeatureFlagService-shaped percentage
// rollout for the one real case where all-or-nothing is too blunt —
// gradually enabling a customer-facing automatic behavior (Phase 11's
// AUTO_COMMERCIAL_OUTREACH_ENABLED) for a percentage of customers rather
// than flipping it on for every customer at once. This is additive, not a
// replacement for lib/customerIdentity/featureFlags.ts's function-per-flag
// shape — dozens of call sites already depend on that exact shape.
//
// Deterministic hash of a stable key (customer ID or phone), never Math.random
// — the same customer always lands in the same bucket across repeated calls,
// so a customer already enrolled in a percentage rollout is never flipped
// back out from one call to the next.

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * True for roughly `percentage`% of distinct `stableKey` values, deterministic
 * per key. `percentage <= 0` is always false, `percentage >= 100` is always true.
 */
export function rolloutEnabled(flagName: string, percentage: number, stableKey: string): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  const bucket = stableHash(`${flagName}:${stableKey}`) % 100;
  return bucket < percentage;
}
