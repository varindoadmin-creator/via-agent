// ─── Shipping policy — deterministic, timezone-safe ────────────────────────────
// VIA Product/Pricing/Company Architecture brief, sections 41-47: dispatch
// commitments only, never an arrival promise (brief section 47's explicit
// distinction between "dikirim/diserahkan ke mitra logistik" and "barang
// tiba"). Uses the same Asia/Jakarta-safe offset-math pattern already used in
// lib/analytics/periods.ts — never raw UTC day/hour boundaries.

const JAKARTA_OFFSET_MINUTES = 7 * 60;
const CUTOFF_HOUR_WIB = 14;

export type ShippingRegion = 'JABODETABEK' | 'OUTSIDE_JABODETABEK';
export type JavaEligibility = 'JAVA' | 'NOT_JAVA' | 'UNKNOWN';

function toJakarta(date: Date): Date {
  return new Date(date.getTime() + JAKARTA_OFFSET_MINUTES * 60_000);
}

/** Brief section 43: Monday-Friday, 14:00 WIB cutoff, computed in Jakarta local time — never raw UTC. */
export function isBeforeCutoff(orderDate: Date = new Date()): boolean {
  const jakarta = toJakarta(orderDate);
  const dayOfWeek = jakarta.getUTCDay(); // 0=Sunday .. 6=Saturday, but the components are already Jakarta-shifted
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  if (!isWeekday) return false; // a weekend order is treated as "after cutoff" for commitment purposes
  return jakarta.getUTCHours() < CUTOFF_HOUR_WIB;
}

export interface DispatchCommitment {
  beforeCutoff: boolean;
  region: ShippingRegion;
  /** Dispatch/handoff-to-logistics wording only — never an arrival date (brief section 47). */
  dispatchText: string;
}

/** Brief sections 41-42. */
export function computeDispatchCommitment(orderDate: Date, region: ShippingRegion): DispatchCommitment {
  const beforeCutoff = isBeforeCutoff(orderDate);
  const jabodetabek = region === 'JABODETABEK';

  let dispatchText: string;
  if (beforeCutoff && jabodetabek) {
    dispatchText = 'Barang akan dikirim keesokan hari kerja, paling lambat 2 hari kerja.';
  } else if (beforeCutoff && !jabodetabek) {
    dispatchText = 'Barang akan diserahkan ke mitra logistik keesokan hari kerja, paling lambat 2 hari kerja.';
  } else if (!beforeCutoff && jabodetabek) {
    dispatchText = 'Barang akan dikirim dalam 2 hari kerja.';
  } else {
    dispatchText = 'Barang akan diserahkan ke mitra logistik dalam 2 hari kerja.';
  }

  return { beforeCutoff, region, dispatchText };
}

// Brief section 44-45: a deterministic Java province/city allow-list — ask if
// unclear, never guess (brief's own explicit instruction).
const JAVA_PROVINCES = ['DKI JAKARTA', 'JAWA BARAT', 'JAWA TENGAH', 'JAWA TIMUR', 'BANTEN', 'DI YOGYAKARTA', 'YOGYAKARTA'];
const JAVA_CITIES = [
  'JAKARTA', 'BANDUNG', 'SURABAYA', 'SEMARANG', 'YOGYAKARTA', 'BOGOR', 'DEPOK', 'TANGERANG', 'BEKASI',
  'MALANG', 'SOLO', 'SURAKARTA', 'CIREBON', 'TASIKMALAYA', 'SUKABUMI', 'CIKARANG', 'KARAWANG', 'SERANG', 'CILEGON',
];

export function checkJavaEligibility(destinationText: string | null | undefined): JavaEligibility {
  if (!destinationText || !destinationText.trim()) return 'UNKNOWN';
  const normalized = destinationText.toUpperCase();
  if (JAVA_PROVINCES.some(p => normalized.includes(p)) || JAVA_CITIES.some(c => normalized.includes(c))) return 'JAVA';
  // A destination clearly outside Java (mentions another well-known island/province) — still explicit, not a guess.
  const NON_JAVA_MARKERS = ['SUMATERA', 'SUMATRA', 'KALIMANTAN', 'SULAWESI', 'BALI', 'PAPUA', 'NTT', 'NTB', 'MALUKU', 'ACEH', 'MEDAN', 'PALEMBANG', 'MAKASSAR', 'BATAM', 'PONTIANAK', 'BANJARMASIN', 'DENPASAR'];
  if (NON_JAVA_MARKERS.some(m => normalized.includes(m))) return 'NOT_JAVA';
  return 'UNKNOWN';
}

// Brief section 44.
export const FREE_SHIPPING_JAVA_TEXT = 'Gratis ongkir dan peti kayu ke seluruh wilayah Jawa tanpa minimum pembelian.';

// Brief section 46.
export const SHIPPING_CONDITIONS_TEXT = [
  'Waktu pengiriman dapat menyesuaikan pada hari libur nasional, cuti bersama, atau kondisi operasional.',
  'Force majeure tidak termasuk dalam komitmen pengiriman.',
  'Wilayah dengan akses logistik terbatas mungkin memerlukan waktu tambahan.',
  'Varindo tidak bertanggung jawab atas keterlambatan akibat alamat pengiriman yang tidak lengkap atau tidak akurat.',
].join(' ');
