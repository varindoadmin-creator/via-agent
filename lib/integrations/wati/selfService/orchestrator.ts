// ─── Customer self-service orchestration ─────────────────────────────────────
// VIA Customer Operations Phase 7: resolves the active customer account
// (Phase 6 mapping + cross-turn reuse), then dispatches to the matching
// lib/customerSelfService/* function and builds the reply. Called by
// pipeline.ts only after responseDecision.ts's L_CUSTOMER_SELF_SERVICE case
// (i.e. only once the audience's identity level has already cleared the bar
// for this category) — this module still never accepts a customerId from
// customer text, only from the resolved audience/active-customer context.

import { resolveCustomerIdentities } from '../../../customerIdentity/channelIdentity.ts';
import { getCustomerById } from '../../../zoho/customers.ts';
import { getActiveCustomerId, setActiveCustomerId, getPendingSelfService, setPendingSelfService } from '../conversationState.ts';
import { getCustomerOwnOrderStatus, getCustomerOwnOrderHistory, getCustomerOwnLastOrder, getCustomerOpenOrders } from '../../../customerSelfService/orderStatus.ts';
import { getCustomerOwnInvoice } from '../../../customerSelfService/invoiceStatus.ts';
import { getCustomerOutstandingInvoices, getCustomerReceivableSummary } from '../../../customerSelfService/outstandingInvoices.ts';
import { getCustomerOwnPaymentStatus } from '../../../customerSelfService/paymentStatus.ts';
import { getCustomerOwnDeliveryStatus } from '../../../customerSelfService/deliveryStatus.ts';
import { sendCustomerInvoiceDocument } from '../../../customerSelfService/documentSend.ts';
import { supabaseInsert } from '../../../supabase/rest.ts';
import {
  askWhichCustomerForInquiry, askWhichOpenOrder, orderStatusReply, orderNotFound, needOrderReference,
  orderHistoryReply, lastOrderReply, invoiceStatusReply, invoiceNotFound, needInvoiceReference,
  invoiceDocumentSent, invoiceDocumentSendFailed, outstandingInvoicesReply, paymentStatusReply,
  receivableSummaryReply, deliveryStatusReply, deliveryDataUnavailable, upstreamUnavailable,
} from './responses.ts';

export interface SelfServiceInput {
  intent: string;
  normalizedPhone: string;
  conversationId: string;
  customerPhoneRaw: string;
  soNumberCandidate: string | null;
  invoiceNumberCandidate: string | null;
  watiMessageId: string | null;
}

export interface SelfServiceResult {
  responseText: string | null;
  responseCase: string;
}

async function logException(input: { conversationId: string; customerId: string | null; category: string; reason: string; status: string }): Promise<void> {
  try {
    await supabaseInsert('customer_service_exceptions', {
      conversation_id: input.conversationId, customer_id: input.customerId, category: input.category, reason: input.reason, status: input.status,
    }, false);
  } catch (error) {
    console.error('[selfService.orchestrator] failed to log exception:', error);
  }
}

type CustomerContextOutcome =
  | { kind: 'RESOLVED'; customerId: string }
  | { kind: 'ASK'; question: string }
  | { kind: 'NONE' };

async function resolveActiveCustomer(normalizedPhone: string): Promise<CustomerContextOutcome> {
  const existing = await getActiveCustomerId(normalizedPhone);
  if (existing) return { kind: 'RESOLVED', customerId: existing };

  const mapping = await resolveCustomerIdentities(normalizedPhone);
  if (mapping.status === 'ONE') {
    await setActiveCustomerId(normalizedPhone, mapping.mapping.customer_id);
    return { kind: 'RESOLVED', customerId: mapping.mapping.customer_id };
  }
  if (mapping.status === 'MANY') {
    const labeled = await Promise.all(mapping.mappings.map(async m => {
      const customer = await getCustomerById(m.customer_id);
      return customer?.company_name || customer?.contact_name || m.customer_id;
    }));
    return { kind: 'ASK', question: askWhichCustomerForInquiry(labeled) };
  }
  return { kind: 'NONE' };
}

/** Brief section 27-28: no explicit SO number given — use the single open order, or ask when there are several, or ask for a reference when there are none. */
type OrderReferenceOutcome =
  | { kind: 'RESOLVED'; soNumber: string }
  | { kind: 'ASK'; question: string }
  | { kind: 'NEEDS_REFERENCE' };

async function resolveOrderReference(customerId: string, soNumberCandidate: string | null): Promise<OrderReferenceOutcome> {
  if (soNumberCandidate) return { kind: 'RESOLVED', soNumber: soNumberCandidate };
  const openOrders = await getCustomerOpenOrders(customerId, 10);
  if (openOrders.length === 0) return { kind: 'NEEDS_REFERENCE' };
  if (openOrders.length === 1) return { kind: 'RESOLVED', soNumber: openOrders[0].salesorder_number };
  return { kind: 'ASK', question: askWhichOpenOrder(openOrders.map(o => o.salesorder_number)) };
}

export async function runCustomerSelfService(input: SelfServiceInput): Promise<SelfServiceResult> {
  const context = await resolveActiveCustomer(input.normalizedPhone);
  if (context.kind === 'ASK') {
    await setPendingSelfService(input.normalizedPhone, { intent: input.intent, ref: input.soNumberCandidate ?? input.invoiceNumberCandidate });
    return { responseText: context.question, responseCase: 'SELF_SERVICE_ASK_CUSTOMER' };
  }
  if (context.kind === 'NONE') {
    return { responseText: null, responseCase: 'SELF_SERVICE_NO_CUSTOMER' }; // Case H disclosure-denied text already sent by the decision layer.
  }

  return dispatch(input, context.customerId);
}

/** Resumes a self-service question after the customer answers a "which account"/"which order" prompt. */
export async function resumeSelfServiceAfterSelection(input: { normalizedPhone: string; text: string; conversationId: string; customerPhoneRaw: string; watiMessageId: string | null }): Promise<SelfServiceResult | null> {
  const pending = await getPendingSelfService(input.normalizedPhone);
  if (!pending) return null;

  const mapping = await resolveCustomerIdentities(input.normalizedPhone);
  if (mapping.status !== 'MANY') { await setPendingSelfService(input.normalizedPhone, null); return null; }

  const labeled = await Promise.all(mapping.mappings.map(async m => ({ customerId: m.customer_id, label: (await getCustomerById(m.customer_id))?.company_name?.toLowerCase() ?? m.customer_id })));
  const choiceIndex = parseInt(input.text.trim(), 10) - 1;
  const byNumber = Number.isInteger(choiceIndex) && choiceIndex >= 0 ? labeled[choiceIndex] : undefined;
  const byName = labeled.find(o => input.text.toLowerCase().includes(o.label));
  const selected = byNumber || byName;
  if (!selected) return { responseText: askWhichCustomerForInquiry(labeled.map(o => o.label)), responseCase: 'SELF_SERVICE_ASK_CUSTOMER_RETRY' };

  await setActiveCustomerId(input.normalizedPhone, selected.customerId);
  await setPendingSelfService(input.normalizedPhone, null);

  return dispatch({
    intent: pending.intent, normalizedPhone: input.normalizedPhone, conversationId: input.conversationId,
    customerPhoneRaw: input.customerPhoneRaw, soNumberCandidate: pending.ref, invoiceNumberCandidate: pending.ref, watiMessageId: input.watiMessageId,
  }, selected.customerId);
}

async function dispatch(input: SelfServiceInput, customerId: string): Promise<SelfServiceResult> {
  try {
    switch (input.intent) {
      case 'ORDER_STATUS_INQUIRY': {
        const ref = await resolveOrderReference(customerId, input.soNumberCandidate);
        if (ref.kind === 'ASK') return { responseText: ref.question, responseCase: 'SELF_SERVICE_ASK_ORDER' };
        if (ref.kind === 'NEEDS_REFERENCE') return { responseText: needOrderReference(), responseCase: 'SELF_SERVICE_NEEDS_ORDER_REF' };
        const order = await getCustomerOwnOrderStatus(customerId, ref.soNumber);
        return order
          ? { responseText: orderStatusReply(order), responseCase: 'ORDER_STATUS_FOUND' }
          : { responseText: orderNotFound(ref.soNumber), responseCase: 'ORDER_STATUS_NOT_FOUND' };
      }
      case 'ORDER_HISTORY': {
        const history = await getCustomerOwnOrderHistory(customerId, 5);
        return { responseText: orderHistoryReply(history), responseCase: 'ORDER_HISTORY_FOUND' };
      }
      case 'LAST_ORDER': {
        const last = await getCustomerOwnLastOrder(customerId);
        return { responseText: lastOrderReply(last), responseCase: 'LAST_ORDER_FOUND' };
      }
      case 'DELIVERY_STATUS': {
        const ref = await resolveOrderReference(customerId, input.soNumberCandidate);
        if (ref.kind === 'ASK') return { responseText: ref.question, responseCase: 'SELF_SERVICE_ASK_ORDER' };
        if (ref.kind === 'NEEDS_REFERENCE') return { responseText: needOrderReference(), responseCase: 'SELF_SERVICE_NEEDS_ORDER_REF' };
        const result = await getCustomerOwnDeliveryStatus(customerId, ref.soNumber);
        if (result.outcome === 'ORDER_NOT_FOUND') return { responseText: orderNotFound(ref.soNumber), responseCase: 'DELIVERY_ORDER_NOT_FOUND' };
        if (result.outcome === 'NO_AUTHORITATIVE_DATA') {
          await logException({ conversationId: input.conversationId, customerId, category: 'DELIVERY_STATUS', reason: 'Zoho packages/shipmentorders lookup failed', status: 'DELIVERY_CHECK' });
          return { responseText: deliveryDataUnavailable(), responseCase: 'DELIVERY_NO_DATA' };
        }
        return { responseText: deliveryStatusReply(result.result.orderNumber, result.result.status), responseCase: 'DELIVERY_STATUS_FOUND' };
      }
      case 'INVOICE_STATUS': {
        if (!input.invoiceNumberCandidate) return { responseText: needInvoiceReference(), responseCase: 'SELF_SERVICE_NEEDS_INVOICE_REF' };
        const invoice = await getCustomerOwnInvoice(customerId, input.invoiceNumberCandidate);
        return invoice
          ? { responseText: invoiceStatusReply(invoice), responseCase: 'INVOICE_STATUS_FOUND' }
          : { responseText: invoiceNotFound(input.invoiceNumberCandidate), responseCase: 'INVOICE_STATUS_NOT_FOUND' };
      }
      case 'INVOICE_DOCUMENT_REQUEST': {
        if (!input.invoiceNumberCandidate) return { responseText: needInvoiceReference(), responseCase: 'SELF_SERVICE_NEEDS_INVOICE_REF' };
        const invoice = await getCustomerOwnInvoice(customerId, input.invoiceNumberCandidate);
        if (!invoice) return { responseText: invoiceNotFound(input.invoiceNumberCandidate), responseCase: 'INVOICE_DOCUMENT_NOT_FOUND' };
        const sendResult = await sendCustomerInvoiceDocument({ customerId, invoice, customerPhoneRaw: input.customerPhoneRaw, conversationId: input.conversationId, watiMessageId: input.watiMessageId });
        if (sendResult === 'FAILED') {
          await logException({ conversationId: input.conversationId, customerId, category: 'INVOICE_DOCUMENT', reason: 'WATI document send failed', status: 'DOCUMENT_SEND_FAILED' });
          return { responseText: invoiceDocumentSendFailed(), responseCase: 'INVOICE_DOCUMENT_SEND_FAILED' };
        }
        return { responseText: invoiceDocumentSent(invoice.invoiceNumber), responseCase: 'INVOICE_DOCUMENT_SENT' };
      }
      case 'OUTSTANDING_INVOICES': {
        const customer = await getCustomerById(customerId);
        const invoices = await getCustomerOutstandingInvoices(customerId, 5);
        return { responseText: outstandingInvoicesReply(customer?.company_name || customer?.contact_name || 'akun ini', invoices), responseCase: 'OUTSTANDING_INVOICES_FOUND' };
      }
      case 'RECEIVABLE_SUMMARY': {
        const customer = await getCustomerById(customerId);
        const summary = await getCustomerReceivableSummary(customerId);
        return { responseText: receivableSummaryReply(customer?.company_name || customer?.contact_name || 'akun ini', summary), responseCase: 'RECEIVABLE_SUMMARY_FOUND' };
      }
      case 'PAYMENT_STATUS': {
        if (!input.invoiceNumberCandidate) return { responseText: needInvoiceReference(), responseCase: 'SELF_SERVICE_NEEDS_INVOICE_REF' };
        const outcome = await getCustomerOwnPaymentStatus(customerId, input.invoiceNumberCandidate);
        if (outcome.outcome === 'NOT_RECORDED') {
          await logException({ conversationId: input.conversationId, customerId, category: 'PAYMENT_STATUS', reason: 'Customer expects payment not yet recorded', status: 'PAYMENT_REVIEW' });
        }
        return { responseText: paymentStatusReply(outcome), responseCase: `PAYMENT_STATUS_${outcome.outcome}` };
      }
      default:
        return { responseText: null, responseCase: 'SELF_SERVICE_UNHANDLED_INTENT' };
    }
  } catch (error) {
    console.error('[selfService.orchestrator]', error instanceof Error ? error.message : 'unknown error');
    await logException({ conversationId: input.conversationId, customerId, category: input.intent, reason: error instanceof Error ? error.message : 'unknown error', status: 'ZOHO_UNAVAILABLE' });
    return { responseText: upstreamUnavailable(), responseCase: 'SELF_SERVICE_UPSTREAM_UNAVAILABLE' };
  }
}
