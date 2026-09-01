// ─── Proactive message content ────────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief section 29: fact selection -> policy
// eligibility -> message content generation, strictly in that order. This
// module only ever fills a fixed Bahasa Indonesia template with facts the
// caller already resolved deterministically (current price via
// getCustomerSafePrice, quotation validity from the actual quotation record,
// catalogue URL from BRAND_RELATIONSHIPS) — it never invents a price, stock
// level, delivery date, promotion, discount, or urgency claim, and it never
// mentions Tier/discount classification (brief sections 11, 28).

import { getBrandRelationship, type BrandName } from '../companyKnowledge/brandRelationships.ts';
import type { ProactiveActionType } from './types.ts';

export interface MessageFacts {
  companyName?: string | null;
  productName?: string | null;
  itemCode?: string | null;
  brand?: BrandName | null;
  quotationNumber?: string | null;
  /** Only ever set from the quotation's own recorded validity — never fabricated (brief section 6). */
  quotationExpired?: boolean | null;
  price?: { amount: number; currency: string; taxIncluded: boolean } | null;
}

function greeting(facts: MessageFacts): string {
  return facts.companyName ? `Selamat siang Kakak dari ${facts.companyName}` : 'Selamat siang Kakak';
}

function formatPrice(price: NonNullable<MessageFacts['price']>): string {
  const amount = new Intl.NumberFormat('id-ID').format(price.amount);
  return `${price.currency} ${amount}${price.taxIncluded ? ' (sudah termasuk pajak)' : ''}`;
}

function catalogueLine(brand: BrandName | null | undefined): string {
  if (!brand) return '';
  const relationship = getBrandRelationship(brand);
  return ` Katalog produk dapat dilihat di ${relationship.website}.`;
}

/** Section 5 — no pressure, no invented scarcity. */
export function quotationFollowUpMessage(facts: MessageFacts, stage: 'INITIAL_FOLLOW_UP' | 'FINAL_FOLLOW_UP'): string {
  const g = greeting(facts);
  if (facts.quotationExpired) {
    return `${g}, penawaran${facts.quotationNumber ? ` ${facts.quotationNumber}` : ''} yang sebelumnya kami kirimkan sudah melewati masa berlakunya. Jika Kakak masih berminat, kami dapat membuatkan penawaran baru dengan harga saat ini.`;
  }
  const base = `${g}, kami ingin menindaklanjuti penawaran${facts.quotationNumber ? ` ${facts.quotationNumber}` : ''} sebelumnya. Apakah ada yang ingin dibantu terkait produk atau pesanannya?`;
  return stage === 'FINAL_FOLLOW_UP'
    ? `${base} Jika belum ada tanggapan, kami akan menutup sementara penawaran ini dan siap membantu kembali kapan saja Kakak membutuhkan.`
    : base;
}

export function orderIntentFollowUpMessage(facts: MessageFacts): string {
  const g = greeting(facts);
  return `${g}, kami ingin membantu melanjutkan pesanan ${facts.productName ?? 'yang sebelumnya ditanyakan'}. Mohon informasinya agar dapat kami proses lebih lanjut.`;
}

/** Section 28 — safe personalization, never "you always buy every N days". */
export function reorderOpportunityMessage(facts: MessageFacts): string {
  const g = greeting(facts);
  const product = facts.productName ? ` ${facts.productName}` : '';
  return `${g}, jika Kakak membutuhkan${product} kembali, kami dapat membantu cek harga dan ketersediaannya.`;
}

export function sampleRequestFollowUpMessage(facts: MessageFacts): string {
  const g = greeting(facts);
  return `${g}, apakah sampel${facts.productName ? ` ${facts.productName}` : ''} yang diterima sudah sesuai kebutuhan? Kami siap membantu jika ada pertanyaan lebih lanjut.${catalogueLine(facts.brand)}`;
}

export function dormantCustomerMessage(facts: MessageFacts): string {
  const g = greeting(facts);
  return `${g}, sudah lama kami tidak menerima kabar dari Kakak. Jika ada kebutuhan produk Lamitak atau EDL, kami siap membantu cek harga dan ketersediaannya.`;
}

export function serviceRecoveryMessage(facts: MessageFacts): string {
  const g = greeting(facts);
  return `${g}, mohon maaf atas keterlambatan penanganan sebelumnya. Tim kami ingin memastikan kebutuhan Kakak sudah tertangani dengan baik.`;
}

export function needsInformationFollowUpMessage(facts: MessageFacts): string {
  const g = greeting(facts);
  return `${g}, kami masih menunggu informasi tambahan${facts.productName ? ` untuk ${facts.productName}` : ''} agar dapat melanjutkan prosesnya. Mohon konfirmasinya.`;
}

const BUILDERS: Partial<Record<ProactiveActionType, (facts: MessageFacts) => string>> = {
  ORDER_INTENT_FOLLOW_UP: orderIntentFollowUpMessage,
  REORDER_OPPORTUNITY: reorderOpportunityMessage,
  SAMPLE_REQUEST_FOLLOW_UP: sampleRequestFollowUpMessage,
  DORMANT_CUSTOMER_REENGAGEMENT: dormantCustomerMessage,
  SERVICE_RECOVERY: serviceRecoveryMessage,
  NEEDS_INFORMATION_FOLLOW_UP: needsInformationFollowUpMessage,
};

/** QUOTATION_FOLLOW_UP needs the follow-up stage, so it is not in the generic map — call quotationFollowUpMessage directly for that type. */
export function buildMessageForAction(type: ProactiveActionType, facts: MessageFacts): string | null {
  const builder = BUILDERS[type];
  return builder ? builder(facts) : null;
}

export { formatPrice };
