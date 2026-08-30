// ─── Commercial/onboarding follow-up detection ───────────────────────────────
// Same short-circuit pattern as lib/integrations/wati/stock/quantityFollowUp.ts:
// a reply to VIA's own onboarding question or "which customer/address" prompt
// is not a classifiable intent on its own and must attach to the existing
// draft, never fall through to generic intent detection (which has no idea
// what to do with a bare "1" or a company name).

import { findActiveCustomerDraft } from '../../../customerIdentity/customerDraft.ts';
import { findActiveDraftForConversation, type CommercialDraft } from './draft.ts';

const ONBOARDING_STATUSES = new Set(['COLLECTING_COMPANY', 'COLLECTING_TAX_REQUIREMENT', 'COLLECTING_NPWP', 'COLLECTING_BILLING_ADDRESS', 'COLLECTING_SHIPPING_ADDRESS']);

export type CommercialFollowUp =
  | { kind: 'ONBOARDING'; customerDraftId: string }
  | { kind: 'CUSTOMER_SELECTION'; draft: CommercialDraft }
  | { kind: 'ADDRESS_SELECTION'; draft: CommercialDraft }
  | null;

export async function matchCommercialFollowUp(normalizedPhone: string | null, conversationId: string): Promise<CommercialFollowUp> {
  if (!normalizedPhone) return null;

  const customerDraft = await findActiveCustomerDraft(normalizedPhone);
  if (customerDraft && ONBOARDING_STATUSES.has(customerDraft.status)) {
    return { kind: 'ONBOARDING', customerDraftId: customerDraft.id };
  }

  const commercialDraft = await findActiveDraftForConversation(conversationId);
  if (commercialDraft?.status === 'NEEDS_CUSTOMER') return { kind: 'CUSTOMER_SELECTION', draft: commercialDraft };
  if (commercialDraft?.status === 'NEEDS_DELIVERY_INFO') return { kind: 'ADDRESS_SELECTION', draft: commercialDraft };

  return null;
}
