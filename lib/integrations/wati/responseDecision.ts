// ─── WATI response decision engine ──────────────────────────────────────────────
// Deterministic Bahasa Indonesia templates only (brief section 13) — no LLM text
// generation for customer-facing replies in this phase, which removes
// hallucination risk entirely for these acknowledgement/clarification/menu
// responses. Never claims stock, price, discounts, or commitments (section 20).

import type { WatiIntent } from './intent.ts';
import type { ProductResolutionStatus } from './productResolution.ts';
import type { ZohoItem } from '../../../types/zoho.ts';
import type { AudienceContext, IdentityLevel } from '../../security/disclosure/audience.ts';
import { evaluateDisclosure, type DisclosureReasonCode } from '../../security/disclosure/policy.ts';
import type { DataCategory } from '../../security/disclosure/classification.ts';
import { responseForReasonCode } from '../../security/disclosure/responses.ts';
import { broadBrandPriceClarification, discountHandoff } from './pricing/responses.ts';
import {
  companyInfoResponse, dealerStatusResponse, shippingPolicyResponse, paymentDestinationResponse,
  tierProbeRedirect, unsupportedProductResponse, sampleCatalogueResponse,
} from './companyKnowledge/responses.ts';
import type { BrandName } from '../../companyKnowledge/brandRelationships.ts';

export type ResponseCase =
  | 'A_GREETING' | 'B_BRAND_INQUIRY' | 'C_PRODUCT_RESOLVED' | 'D_STOCK_ACK' | 'E_CLARIFICATION' | 'F_HUMAN'
  | 'G_ACK_ROUTE' | 'H_DISCLOSURE_DENIED' | 'I_PRICE_LOOKUP' | 'J_BROAD_BRAND_PRICE' | 'M_DISCOUNT_HANDOFF'
  | 'K_COMMERCIAL_WORKFLOW' | 'L_CUSTOMER_SELF_SERVICE'
  | 'N_TIER_PROBE_REDIRECT' | 'O_COMPANY_INFO' | 'P_DEALER_STATUS' | 'Q_SHIPPING_POLICY' | 'R_PAYMENT_DESTINATION'
  | 'S_SAMPLE_CATALOGUE' | 'T_UNSUPPORTED_PRODUCT'
  | 'SUPPRESSED';

function isBrandName(brand: string | null): brand is BrandName {
  return brand === 'LAMITAK' || brand === 'EDL';
}

export interface ResponseDecisionInput {
  intent: WatiIntent;
  brand: string | null;
  productResolution: ProductResolutionStatus | null;
  product: ZohoItem | null;
  productCodeCandidate: string | null;
  conversationSuppressed: boolean; // true when conversation state is NEEDS_HUMAN/HUMAN_ACTIVE
  /** Required for the Phase 4 disclosure-gated intents (INTERNAL_METRIC/OTHER_CUSTOMER/ORDER_STATUS). */
  audience?: AudienceContext;
  /** Only meaningful for UNSUPPORTED_PRODUCT_INQUIRY — see IntentDetectionResult.unsupportedScopeReason. */
  unsupportedScopeReason?: 'BRAND' | 'CATEGORY' | null;
  /** Phase 6 feature flag (brief section 80) — defaults to enabled so existing tests/callers that don't pass it keep today's behavior; pipeline.ts passes the real flag value in production. */
  commercialDraftEnabled?: boolean;
  /** Phase 7 feature flags (brief section 76), one per self-service capability — each defaults to enabled so existing tests/callers keep today's behavior; pipeline.ts passes the real flag values in production. */
  selfServiceFlags?: {
    orderStatus?: boolean;
    invoiceStatus?: boolean;
    invoiceDocument?: boolean;
    paymentStatus?: boolean;
    receivableSummary?: boolean;
    deliveryStatus?: boolean;
  };
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
  return 'Halo, selamat datang di Varindo. Terima kasih telah menghubungi kami.\nSilakan sampaikan kebutuhan Anda, misalnya cek stok, harga, informasi produk, katalog, pengiriman, atau pesanan. Kami akan bantu cek terlebih dahulu.';
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

  // Product/Pricing/Company Architecture brief section 19/79/80: checked
  // before any disclosure lookup — this is a fixed redirect, never a Tier or
  // Special-Price disclosure, and never a human handoff (Jarvis can already
  // help with the real price deterministically).
  if (input.intent === 'TIER_OR_PRICING_CLASSIFICATION_PROBE') {
    return { case: 'N_TIER_PROBE_REDIRECT', text: tierProbeRedirect(), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'COMPANY_INFO_INQUIRY') {
    return { case: 'O_COMPANY_INFO', text: companyInfoResponse(), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'DEALER_STATUS_INQUIRY') {
    return { case: 'P_DEALER_STATUS', text: dealerStatusResponse(isBrandName(input.brand) ? input.brand : null), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'SHIPPING_POLICY_INQUIRY') {
    return { case: 'Q_SHIPPING_POLICY', text: shippingPolicyResponse(), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'PAYMENT_DESTINATION_INQUIRY') {
    return { case: 'R_PAYMENT_DESTINATION', text: paymentDestinationResponse(), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'SAMPLE_CATALOGUE_REQUEST') {
    // Brief section 53: never re-collects company/email/address/sample details in WhatsApp — just the correct website.
    return { case: 'S_SAMPLE_CATALOGUE', text: sampleCatalogueResponse(isBrandName(input.brand) ? input.brand : null), createStockInquiry: false, markHumanRequest: false };
  }

  if (input.intent === 'UNSUPPORTED_PRODUCT_INQUIRY') {
    // Brief sections 9-11: a fixed decline, never invented, never escalated to human.
    return { case: 'T_UNSUPPORTED_PRODUCT', text: unsupportedProductResponse(input.unsupportedScopeReason === 'BRAND' ? 'BRAND' : 'CATEGORY'), createStockInquiry: false, markHumanRequest: false };
  }

  // Phase 4: internal-metric and other-customer questions go through the
  // disclosure check with no lookup ever attempted (brief section 14's "the
  // system should preferably NOT call the tool").
  if (input.intent === 'INTERNAL_METRIC_INQUIRY' || input.intent === 'OTHER_CUSTOMER_INQUIRY') {
    const category = input.intent === 'INTERNAL_METRIC_INQUIRY' ? 'BRAND_SALES' : 'OTHER_CUSTOMER_DATA';
    const result = input.audience
      ? evaluateDisclosure({ audience: input.audience, category })
      : { decision: 'DENY' as const, reasonCode: 'POLICY_EVALUATION_FAILED' as const };
    // Neither intent is ever actually grantable from WATI (no audience
    // constructed there is ever INTERNAL_USER) — an unexpected ALLOW falls
    // back to the safe generic ack rather than the empty string
    // responseForReasonCode returns for allow-shaped reason codes.
    const text = result.decision === 'ALLOW' ? ackRoute() : responseForReasonCode(result.reasonCode);
    return { case: 'H_DISCLOSURE_DENIED', text, createStockInquiry: false, markHumanRequest: false, disclosureReasonCode: result.reasonCode };
  }

  // Phase 7 (brief sections 3, 15-16, 32-34): customer self-service. Every
  // one of these intents defers its actual lookup to the async pipeline
  // (lib/customerSelfService/*, ownership-scoped by construction) — this
  // pure function only decides whether the audience's identity level even
  // clears the bar to ATTEMPT that lookup at all. Reuses evaluateDisclosure's
  // existing CUSTOMER_SCOPED check by passing `ownerCustomerId:
  // audience.customerId` — a deliberate self-reference, since at this
  // pre-lookup stage the only "owner" candidate is whichever customer Phase
  // 6 already resolved for this phone; the real record-level ownership
  // check happens again once the pipeline has an actual Zoho record (brief
  // section 38 defense-in-depth), where a genuine cross-customer mismatch is
  // structurally impossible because the lookup functions themselves only
  // ever query by that same customerId.
  const SELF_SERVICE_INTENTS: Partial<Record<WatiIntent, { category: DataCategory; requiredIdentityLevel?: IdentityLevel; enabled: boolean }>> = {
    ORDER_STATUS_INQUIRY: { category: 'OWN_ORDER_STATUS', enabled: input.selfServiceFlags?.orderStatus !== false },
    ORDER_HISTORY: { category: 'OWN_ORDER_STATUS', enabled: input.selfServiceFlags?.orderStatus !== false },
    LAST_ORDER: { category: 'OWN_ORDER_STATUS', enabled: input.selfServiceFlags?.orderStatus !== false },
    DELIVERY_STATUS: { category: 'OWN_ORDER_STATUS', enabled: input.selfServiceFlags?.deliveryStatus !== false },
    INVOICE_STATUS: { category: 'OWN_INVOICE', enabled: input.selfServiceFlags?.invoiceStatus !== false },
    OUTSTANDING_INVOICES: { category: 'OWN_INVOICE', enabled: input.selfServiceFlags?.invoiceStatus !== false },
    RECEIVABLE_SUMMARY: { category: 'OWN_INVOICE', enabled: input.selfServiceFlags?.receivableSummary !== false },
    INVOICE_DOCUMENT_REQUEST: { category: 'OWN_INVOICE', requiredIdentityLevel: 'VERIFIED_CUSTOMER', enabled: input.selfServiceFlags?.invoiceDocument !== false },
    PAYMENT_STATUS: { category: 'OWN_PAYMENT_STATUS', enabled: input.selfServiceFlags?.paymentStatus !== false },
  };
  const selfService = SELF_SERVICE_INTENTS[input.intent];
  if (selfService) {
    if (!selfService.enabled) return { case: 'G_ACK_ROUTE', text: ackRoute(), createStockInquiry: false, markHumanRequest: false };
    const ownerCustomerId = input.audience?.customerId;
    const result = input.audience
      ? evaluateDisclosure({ audience: input.audience, category: selfService.category, ownerCustomerId, requiredIdentityLevel: selfService.requiredIdentityLevel })
      : { decision: 'DENY' as const, reasonCode: 'POLICY_EVALUATION_FAILED' as const };
    if (result.decision === 'ALLOW') {
      return { case: 'L_CUSTOMER_SELF_SERVICE', text: null, createStockInquiry: false, markHumanRequest: false };
    }
    return { case: 'H_DISCLOSURE_DENIED', text: responseForReasonCode(result.reasonCode), createStockInquiry: false, markHumanRequest: false, disclosureReasonCode: result.reasonCode };
  }

  // GENERAL_INQUIRY / UNKNOWN — safe default, makes no claims, offers the menu.
  return { case: 'A_GREETING', text: greeting(), createStockInquiry: false, markHumanRequest: false };
}
