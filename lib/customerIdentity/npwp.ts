// ─── NPWP format validation ──────────────────────────────────────────────────
// Brief section 8: NPWP is only ever collected as customer-supplied text and
// deterministically validated — never inferred or generated. Indonesia's
// classic NPWP is 15 digits (formatted XX.XXX.XXX.X-XXX.XXX); since 2024 the
// 16-digit NIK-based format is also valid. This only checks *shape* (digit
// count), never verifies the number is real — that's outside VIA's ability
// to check deterministically.

export interface NpwpValidationResult {
  valid: boolean;
  normalized: string | null; // digits-only, or null when invalid
  reason?: string;
}

export function validateNpwp(raw: string | null | undefined): NpwpValidationResult {
  if (!raw || !raw.trim()) {
    return { valid: false, normalized: null, reason: 'NPWP is required.' };
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 15 && digits.length !== 16) {
    return { valid: false, normalized: null, reason: 'NPWP must be 15 or 16 digits.' };
  }
  return { valid: true, normalized: digits };
}

export function formatNpwp(digits: string): string {
  if (digits.length === 15) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}.${digits.slice(8, 9)}-${digits.slice(9, 12)}.${digits.slice(12, 15)}`;
  }
  return digits;
}
