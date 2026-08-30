// ─── Phone key normalization ─────────────────────────────────────────────────
// Zero-dependency on purpose: lib/customerCleanup/duplicates.ts (tested via
// plain `node --test`) and lib/customers/phoneResolution.ts (which additionally
// depends on Zoho customer lookup) both need this without pulling in Zoho.

/** Last 9 digits — absorbs 0/62/+62 country-code prefix differences. */
export function normalizePhoneKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(-9);
}
