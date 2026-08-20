import { formatBusinessName, formatPersonName, normalizeSpaces } from '../customerCleanup/rules.ts';

const LEGAL_ENTITY = /(?:^|[,.\s])(PT|CV|UD|PD|FA|TBK|KOPERASI|YAYASAN)\.?(?:$|[,.\s])/i;
const BUSINESS_WORDS = /\b(TOKO|TB|HPL|INTERIOR|TRADING|GALLERY|DECO|FURNITURE|MEBEL|KAYU|MANDIRI|JAYA|ABADI|SEJAHTERA|SUKSES|MAKMUR|BERKAT|KREASI|PERKASA|UTAMA|SENTOSA|DEALER|DISTRIBUTOR)\b/i;

export type LeadNameKind = 'business' | 'individual' | 'unclear';

export interface LeadNormalization {
  customer_name: string;
  phone: string;
  address: string;
  nameKind: LeadNameKind;
}

/** Infer only strong business/person signals. A one-word name without a signal is left unclear. */
export function inferLeadNameKind(raw: string): LeadNameKind {
  const name = normalizeSpaces(raw);
  if (!name) return 'unclear';
  if (LEGAL_ENTITY.test(name) || BUSINESS_WORDS.test(name)) return 'business';
  const words = name.match(/[\p{L}][\p{L}'.-]*/gu) || [];
  return words.length >= 2 && words.length <= 5 ? 'individual' : 'unclear';
}

export function normalizeLeadName(raw: string, forcedKind?: Exclude<LeadNameKind, 'unclear'>): { value: string; kind: LeadNameKind } {
  const clean = normalizeSpaces(raw);
  const kind = forcedKind || inferLeadNameKind(clean);
  if (kind === 'business') return { value: formatBusinessName(clean), kind };
  if (kind === 'individual') return { value: formatPersonName(clean), kind };
  return { value: clean, kind };
}

function normalizeIndonesianNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;
  if (digits.startsWith('8')) return `0${digits}`;
  return digits;
}

/** Normalize phone-like fragments while preserving social handles, websites, and notes. */
export function normalizeLeadPhone(raw: string): string {
  const clean = normalizeSpaces(raw);
  if (!clean) return clean;
  return clean
    .split(/\s*\/\s*/)
    .map(part => normalizeIndonesianNumber(part) || part.trim())
    .join(' / ');
}

/** Conservative free-text cleanup: whitespace and punctuation only; no location is invented. */
export function normalizeLeadAddress(raw: string): string {
  return normalizeSpaces(raw)
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/\s+([.;])/g, '$1')
    .trim();
}

export function normalizeLeadRecord(
  input: { customer_name?: string | null; phone?: string | null; address?: string | null },
  forcedKind?: Exclude<LeadNameKind, 'unclear'>,
): LeadNormalization {
  const name = normalizeLeadName(input.customer_name || '', forcedKind);
  return {
    customer_name: name.value,
    phone: normalizeLeadPhone(input.phone || ''),
    address: normalizeLeadAddress(input.address || ''),
    nameKind: name.kind,
  };
}
