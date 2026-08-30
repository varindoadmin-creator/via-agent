// ─── Source / attribution resolution ────────────────────────────────────────────
// Brief section 12. Never claims Google Ads attribution from guesswork — only
// from actual referral metadata WATI forwards, if any. Raw payload is always
// preserved (store.ts) regardless, so future marketing-attribution work isn't
// blocked by an unrecognized field name today.

export type WatiInquirySource = 'WEBSITE' | 'GOOGLE_ADS' | 'DIRECT_WHATSAPP' | 'UNKNOWN';

// Candidate field names for ad-click referral metadata some WhatsApp Business
// providers forward (e.g. Meta's click-to-WhatsApp `ctwa_clid`/referral object).
// Unverified against a real WATI payload — see docs/integrations/wati.md.
const REFERRAL_FIELD_CANDIDATES = ['ctwaClid', 'ctwa_clid', 'sourceId', 'sourceUrl', 'sourceType'];

function hasReferralSignal(payload: Record<string, unknown>): boolean {
  const referral = payload.referral as Record<string, unknown> | undefined;
  if (referral && typeof referral === 'object') {
    return REFERRAL_FIELD_CANDIDATES.some(key => Boolean(referral[key]));
  }
  return REFERRAL_FIELD_CANDIDATES.some(key => Boolean(payload[key]));
}

export function resolveSource(payload: Record<string, unknown>, isWebsiteFormatted: boolean): WatiInquirySource {
  if (isWebsiteFormatted) return 'WEBSITE';
  if (hasReferralSignal(payload)) return 'GOOGLE_ADS';
  return 'DIRECT_WHATSAPP';
}
