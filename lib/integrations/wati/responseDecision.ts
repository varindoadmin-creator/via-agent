// ─── WATI response decision engine ──────────────────────────────────────────────
// Deterministic Bahasa Indonesia templates only (brief section 13) — no LLM text
// generation for customer-facing replies in this phase, which removes
// hallucination risk entirely for these acknowledgement/clarification/menu
// responses. Never claims stock, price, discounts, or commitments (section 20).

import type { WatiIntent } from './intent.ts';
import type { ProductResolutionStatus } from './productResolution.ts';
import type { ZohoItem } from '../../../types/zoho.ts';

export type ResponseCase = 'A_GREETING' | 'B_BRAND_INQUIRY' | 'C_PRODUCT_RESOLVED' | 'D_STOCK_ACK' | 'E_CLARIFICATION' | 'F_HUMAN' | 'G_ACK_ROUTE' | 'SUPPRESSED';

export interface ResponseDecisionInput {
  intent: WatiIntent;
  brand: string | null;
  productResolution: ProductResolutionStatus | null;
  product: ZohoItem | null;
  productCodeCandidate: string | null;
  conversationSuppressed: boolean; // true when conversation state is NEEDS_HUMAN/HUMAN_ACTIVE
}

export interface ResponseDecision {
  case: ResponseCase;
  text: string | null; // null when SUPPRESSED — no automated reply is sent
  createStockInquiry: boolean;
  markHumanRequest: boolean;
}

const OPTIONS_MENU = '1. Cek Stok\n2. Informasi Produk\n3. Hubungi Admin';

function greeting(): string {
  return `Halo, selamat datang di Varindo. Terima kasih telah menghubungi kami. Ada yang dapat kami bantu?\n\n${OPTIONS_MENU}`;
}

function brandInquiry(brand: string): string {
  return `Halo Pak/Bu, terima kasih telah menghubungi Varindo. Dengan senang hati kami bantu terkait produk ${brand}. Informasi apa yang Bapak/Ibu perlukan?\n\n${OPTIONS_MENU}`;
}

function productResolved(item: ZohoItem): string {
  const label = item.sku ? `${item.sku} - ${item.name}` : item.name;
  return `Halo Pak/Bu, terima kasih telah menghubungi Varindo terkait ${label}. Ada yang dapat kami bantu terkait produk tersebut?\n\n${OPTIONS_MENU}`;
}

/** Exported for reuse by the Phase 3 stock workflow (lib/integrations/wati/stock/service.ts) — same immediate acknowledgement, now followed by an actual vendor-first check instead of nothing. */
export function stockAck(item: ZohoItem): string {
  const label = item.sku || item.name;
  return `Baik Pak/Bu, kami bantu cek ketersediaan stok ${label} terlebih dahulu. Mohon ditunggu sebentar ya.`;
}

function clarification(): string {
  return 'Baik Pak/Bu. Boleh dibantu kirim kode barang atau foto produknya agar kami dapat membantu dengan tepat?';
}

function humanRequest(): string {
  return 'Baik Pak/Bu, kami bantu hubungkan dengan Admin Varindo.';
}

function ackRoute(): string {
  return 'Baik Pak/Bu, mohon ditunggu, tim kami akan segera membantu terkait hal tersebut.';
}

/**
 * Pure decision function — no I/O. `conversationSuppressed` is checked first:
 * VIA still records the message, but section 21 forbids sending a further
 * automated reply once a human has taken over.
 */
export function decideResponse(input: ResponseDecisionInput): ResponseDecision {
  if (input.conversationSuppressed && input.intent !== 'HUMAN_REQUEST') {
    return { case: 'SUPPRESSED', text: null, createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'HUMAN_REQUEST') {
    return { case: 'F_HUMAN', text: humanRequest(), createStockInquiry: false, markHumanRequest: true };
  }

  if (input.intent === 'GREETING') {
    return { case: 'A_GREETING', text: greeting(), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'STOCK_CHECK') {
    if (input.productResolution === 'EXACT' && input.product) {
      return { case: 'D_STOCK_ACK', text: stockAck(input.product), createStockInquiry: true, markHumanRequest: false };
    }
    return { case: 'E_CLARIFICATION', text: clarification(), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'PRODUCT_INQUIRY') {
    if (input.productResolution === 'EXACT' && input.product) {
      return { case: 'C_PRODUCT_RESOLVED', text: productResolved(input.product), createStockInquiry: false, markHumanRequest: false };
    }
    if (input.brand) {
      return { case: 'B_BRAND_INQUIRY', text: brandInquiry(input.brand), createStockInquiry: false, markHumanRequest: false };
    }
    return { case: 'E_CLARIFICATION', text: clarification(), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'PRICE_INQUIRY' || input.intent === 'ORDER_INQUIRY') {
    // Sections 19-20: never quote price/confirm orders automatically — acknowledge and route.
    return { case: 'G_ACK_ROUTE', text: ackRoute(), createStockInquiry: false, markHumanRequest: false };
  }

  // GENERAL_INQUIRY / UNKNOWN — safe default, makes no claims, offers the menu.
  return { case: 'A_GREETING', text: greeting(), createStockInquiry: false, markHumanRequest: false };
}
