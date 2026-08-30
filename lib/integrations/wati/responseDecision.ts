// ─── WATI response decision engine ──────────────────────────────────────────────
// Deterministic Bahasa Indonesia templates only (brief section 13) — no LLM text
// generation for customer-facing replies in this phase, which removes
// hallucination risk entirely for these acknowledgement/clarification/menu
// responses. Never claims stock, price, discounts, or commitments (section 20).

import type { WatiIntent } from './intent.ts';
import type { ProductResolutionStatus } from './productResolution.ts';
import type { ZohoItem } from '../../../types/zoho.ts';
import type { AudienceContext } from '../../security/disclosure/audience.ts';
import { evaluateDisclosure, type DisclosureReasonCode } from '../../security/disclosure/policy.ts';
import { responseForReasonCode } from '../../security/disclosure/responses.ts';
import { broadBrandPriceClarification, discountHandoff } from './pricing/responses.ts';

export type ResponseCase = 'A_GREETING' | 'B_BRAND_INQUIRY' | 'C_PRODUCT_RESOLVED' | 'D_STOCK_ACK' | 'E_CLARIFICATION' | 'F_HUMAN' | 'G_ACK_ROUTE' | 'H_DISCLOSURE_DENIED' | 'I_PRICE_LOOKUP' | 'J_BROAD_BRAND_PRICE' | 'M_DISCOUNT_HANDOFF' | 'K_COMMERCIAL_WORKFLOW' | 'SUPPRESSED';

export interface ResponseDecisionInput {
  intent: WatiIntent;
  brand: string | null;
  productResolution: ProductResolutionStatus | null;
  product: ZohoItem | null;
  productCodeCandidate: string | null;
  conversationSuppressed: boolean; // true when conversation state is NEEDS_HUMAN/HUMAN_ACTIVE
  /** Required for the Phase 4 disclosure-gated intents (INTERNAL_METRIC/OTHER_CUSTOMER/ORDER_STATUS). */
  audience?: AudienceContext;
  /** Phase 6 feature flag (brief section 80) — defaults to enabled so existing tests/callers that don't pass it keep today's behavior; pipeline.ts passes the real flag value in production. */
  commercialDraftEnabled?: boolean;
}

export interface ResponseDecision {
  case: ResponseCase;
  text: string | null; // null when SUPPRESSED — no automated reply is sent
  createStockInquiry: boolean;
  markHumanRequest: boolean;
  /** Set only for H_DISCLOSURE_DENIED — for security-event logging, never for a second lookup attempt. */
  disclosureReasonCode?: DisclosureReasonCode;
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

  if (input.intent === 'ORDER_INQUIRY') {
    // No order-creation capability exists yet (Phase 6+) — acknowledge and route.
    return { case: 'G_ACK_ROUTE', text: ackRoute(), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'PRICE_INQUIRY' || input.intent === 'STOCK_AND_PRICE_INQUIRY') {
    if (input.productResolution === 'EXACT' && input.product) {
      // The actual price text requires an async, verified lookup (lib/zoho/pricing.ts) —
      // resolved by the pipeline after this decision, same pattern as Phase 3's
      // D_STOCK_ACK. `text: null` here is intentional, not SUPPRESSED.
      return { case: 'I_PRICE_LOOKUP', text: null, createStockInquiry: false, markHumanRequest: false };
    }
    if (input.brand) {
      // "Lamitak harganya berapa?" — too broad, never invent a single brand-wide price.
      return { case: 'J_BROAD_BRAND_PRICE', text: broadBrandPriceClarification(), createStockInquiry: false, markHumanRequest: false };
    }
    return { case: 'E_CLARIFICATION', text: clarification(), createStockInquiry: false, markHumanRequest: false };
  }

  // Phase 6 sections 2/33: commercial-intent cases all defer their actual
  // text to the async pipeline workflow (lib/integrations/wati/commercial/workflow.ts)
  // — same "text: null, not SUPPRESSED" pattern as I_PRICE_LOOKUP, since
  // resolving identity/address/price/stock requires I/O this pure function
  // can't do. ORDER_INTENT/QUOTATION_REQUEST without a resolved product falls
  // to Case E clarification below instead — never starts a draft for an
  // unresolvable product (brief section 35).
  const commercialDraftEnabled = input.commercialDraftEnabled !== false;
  if (input.intent === 'ORDER_INTENT' || input.intent === 'QUOTATION_REQUEST') {
    if (!commercialDraftEnabled) return { case: 'G_ACK_ROUTE', text: ackRoute(), createStockInquiry: false, markHumanRequest: false };
    if (input.productResolution === 'EXACT' && input.product) {
      return { case: 'K_COMMERCIAL_WORKFLOW', text: null, createStockInquiry: false, markHumanRequest: false };
    }
    return { case: 'E_CLARIFICATION', text: clarification(), createStockInquiry: false, markHumanRequest: false };
  }
  if (input.intent === 'ORDER_MODIFICATION' || input.intent === 'ORDER_CANCELLATION_REQUEST') {
    if (!commercialDraftEnabled) return { case: 'G_ACK_ROUTE', text: ackRoute(), createStockInquiry: false, markHumanRequest: false };
    return { case: 'K_COMMERCIAL_WORKFLOW', text: null, createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'DISCOUNT_REQUEST') {
    // Brief section 37: no approved automatic-discount policy exists — human/Sales handoff, no threshold disclosed.
    return { case: 'M_DISCOUNT_HANDOFF', text: discountHandoff(), createStockInquiry: false, markHumanRequest: true };
  }

  // Phase 4: internal-metric, other-customer, and own-order-status questions
  // all go through the same disclosure check — no lookup is ever attempted
  // for any of them (brief section 14's "the system should preferably NOT
  // call the tool"). ORDER_STATUS_INQUIRY has no ownerCustomerId to check
  // (no real order-lookup service exists yet) — evaluateDisclosure's
  // CUSTOMER_SCOPED branch with no owner known correctly yields the same
  // "we need to verify/hand this to Admin" text, without inventing a
  // capability that isn't built (brief section 11).
  if (input.intent === 'INTERNAL_METRIC_INQUIRY' || input.intent === 'OTHER_CUSTOMER_INQUIRY' || input.intent === 'ORDER_STATUS_INQUIRY') {
    const category = input.intent === 'INTERNAL_METRIC_INQUIRY' ? 'BRAND_SALES' : input.intent === 'OTHER_CUSTOMER_INQUIRY' ? 'OTHER_CUSTOMER_DATA' : 'OWN_ORDER_STATUS';
    const result = input.audience
      ? evaluateDisclosure({ audience: input.audience, category })
      : { decision: 'DENY' as const, reasonCode: 'POLICY_EVALUATION_FAILED' as const };
    // These three intents are never actually grantable from WATI (no audience
    // constructed there is ever INTERNAL_USER) — an unexpected ALLOW falls
    // back to the safe generic ack rather than the empty string
    // responseForReasonCode returns for allow-shaped reason codes.
    const text = result.decision === 'ALLOW' ? ackRoute() : responseForReasonCode(result.reasonCode);
    return { case: 'H_DISCLOSURE_DENIED', text, createStockInquiry: false, markHumanRequest: false, disclosureReasonCode: result.reasonCode };
  }

  // GENERAL_INQUIRY / UNKNOWN — safe default, makes no claims, offers the menu.
  return { case: 'A_GREETING', text: greeting(), createStockInquiry: false, markHumanRequest: false };
}
