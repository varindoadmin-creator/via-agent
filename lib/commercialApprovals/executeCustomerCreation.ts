// ─── Approval-controlled Zoho Customer creation ──────────────────────────────
// Brief sections 13-15: claim -> revalidate everything -> write -> map ->
// sync -> finalize-or-reconcile. Mirrors lib/jarvis/approvals/execute.ts's
// concurrency-safety shape (claim-with-status-filter, EXECUTION_UNKNOWN on an
// uncertain Zoho outcome, never auto-retry).

import { claimApprovalForExecution, finishApproval, markExecutionUnknown } from './store.ts';
import { recordAnalyticsEvent } from '../analytics/events.ts';
import { isAnalyticsEventPipelineEnabled } from '../customerIdentity/featureFlags.ts';
import { getCustomerDraft, updateCustomerDraft } from '../customerIdentity/customerDraft.ts';
import { isApprovalStillValid, computeDraftHash } from '../customerIdentity/approval.ts';
import { checkForDuplicateCustomer } from '../customerIdentity/duplicateCheck.ts';
import { validateNpwp } from '../customerIdentity/npwp.ts';
import { createChannelIdentity } from '../customerIdentity/channelIdentity.ts';
import { syncCustomerToWati } from '../customerIdentity/watiContactSync.ts';
import { createApprovedCustomer, getAllCustomers } from '../zoho/customers.ts';
import { attachCustomerToOnboardingDrafts } from '../integrations/wati/commercial/draft.ts';
import type { CustomerDraft } from '../customerIdentity/customerDraft.ts';

export function customerDraftMaterialFields(draft: CustomerDraft): Record<string, unknown> {
  return {
    company_name: draft.company_name,
    contact_person_name: draft.contact_person_name,
    email: draft.email,
    needs_faktur_pajak: draft.needs_faktur_pajak,
    npwp: draft.npwp,
    billing_address: draft.billing_address,
    shipping_address: draft.shipping_address,
  };
}

export async function approveAndCreateCustomer(approvalId: string): Promise<{ customerId: string; customerName: string }> {
  const action = await claimApprovalForExecution(approvalId);
  if (!action || action.draft_type !== 'CUSTOMER') {
    throw new Error('This approval is invalid, already used, or not a customer-creation approval.');
  }

  const draft = await getCustomerDraft(action.draft_id);
  if (!draft) {
    await finishApproval(action.id, { status: 'FAILED', error: 'Customer draft no longer exists.' });
    throw new Error('Customer draft no longer exists.');
  }

  // Section 46: revalidate everything immediately before the write.
  if (!isApprovalStillValid({ approvedVersion: action.draft_version, approvedHash: action.draft_hash, currentVersion: draft.version, currentMaterialFields: customerDraftMaterialFields(draft) })) {
    await finishApproval(action.id, { status: 'FAILED', error: 'Draft changed after approval; prepare a new approval before creating this customer.' });
    throw new Error('Draft changed after approval; prepare a new approval before creating this customer.');
  }

  if (!draft.company_name || !draft.billing_address) {
    await finishApproval(action.id, { status: 'FAILED', error: 'Required fields are missing on the draft.' });
    throw new Error('Required fields are missing on the draft.');
  }

  if (draft.needs_faktur_pajak) {
    const npwpCheck = validateNpwp(draft.npwp);
    if (!npwpCheck.valid) {
      await finishApproval(action.id, { status: 'FAILED', error: 'NPWP is required and missing/invalid for a Faktur-Pajak customer.' });
      throw new Error('NPWP is required and missing/invalid for a Faktur-Pajak customer.');
    }
  }

  const allCustomers = await getAllCustomers();
  const duplicateCheck = checkForDuplicateCustomer({ companyName: draft.company_name, npwp: draft.npwp, email: draft.email, phone: draft.normalized_phone }, allCustomers);
  if (duplicateCheck.status !== 'NO_DUPLICATE') {
    await finishApproval(action.id, { status: 'FAILED', error: `Duplicate check now reports ${duplicateCheck.status}; resolve before creating.` });
    throw new Error(`Duplicate check now reports ${duplicateCheck.status}; resolve before creating.`);
  }

  let createdCustomerId: string | null = null;
  try {
    const customer = await createApprovedCustomer({
      companyName: draft.company_name,
      contactPersonName: draft.contact_person_name,
      email: draft.email,
      needsFakturPajak: Boolean(draft.needs_faktur_pajak),
      npwp: draft.npwp,
      billingAddress: draft.billing_address,
      shippingAddress: draft.shipping_address,
    });
    createdCustomerId = customer.contact_id;

    await updateCustomerDraft(draft.id, draft.version, { status: 'CUSTOMER_CREATED', created_customer_id: customer.contact_id });

    const mapping = await createChannelIdentity({
      normalizedPhone: draft.normalized_phone,
      watiContactId: draft.wati_contact_id,
      customerId: customer.contact_id,
      source: 'ONBOARDING_CREATED',
      relationshipStatus: 'VERIFIED',
      verifiedBy: 'system:onboarding_approved',
    });

    // WATI sync failure never blocks/rolls back a valid Zoho customer (brief section 61).
    await syncCustomerToWati({ channelIdentityId: mapping.id, normalizedPhone: draft.normalized_phone, customer }).catch(() => undefined);
    await attachCustomerToOnboardingDrafts(draft.id, customer.contact_id).catch(() => undefined);

    await finishApproval(action.id, { status: 'COMPLETED', zohoObjectId: customer.contact_id, zohoObjectNumber: customer.contact_name });
    if (isAnalyticsEventPipelineEnabled()) {
      void recordAnalyticsEvent({ eventType: 'customer.onboarding.completed', sourceId: draft.id, conversationId: draft.normalized_phone, customerId: customer.contact_id });
    }
    return { customerId: customer.contact_id, customerName: customer.contact_name };
  } catch (cause) {
    if (createdCustomerId) {
      // Zoho already confirmed the write but a later step (mapping/draft update) failed —
      // do not retry customer creation, it would create a duplicate.
      await markExecutionUnknown(action.id);
      throw new Error(`Zoho created customer ${createdCustomerId}, but VIA could not finish linking it. Do not retry; reconcile this approval manually.`);
    }
    const message = cause instanceof Error ? cause.message : 'Customer creation failed.';
    await finishApproval(action.id, { status: 'FAILED', error: message }).catch(() => undefined);
    throw cause;
  }
}

export { computeDraftHash };
