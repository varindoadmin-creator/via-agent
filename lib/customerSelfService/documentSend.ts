// ─── Customer invoice document send ──────────────────────────────────────────
// VIA Customer Operations Phase 7, brief sections 17-19, 44: fetches the real
// Zoho invoice PDF (never model-generated), sends it through WATI, and
// audits the send. Ownership + identity-level verification happens one layer
// up (the caller only reaches here after evaluateDisclosure ALLOWs) — this
// function still requires the caller to have already resolved a
// CustomerSafeInvoice for the correct customer, so there is no path here that
// accepts a bare invoiceId without going through the ownership-scoped lookup.

import { getInvoicePdf } from '../zoho/invoices.ts';
import { sendWatiDocument } from '../integrations/wati/client.ts';
import { supabaseInsert } from '../supabase/rest.ts';
import type { CustomerSafeInvoice } from './invoiceStatus.ts';

export type DocumentSendResult = 'SENT' | 'FAILED';

export async function sendCustomerInvoiceDocument(input: {
  customerId: string;
  invoice: CustomerSafeInvoice;
  customerPhoneRaw: string;
  conversationId: string | null;
  watiMessageId: string | null;
}): Promise<DocumentSendResult> {
  let result: DocumentSendResult;
  try {
    const pdf = await getInvoicePdf(input.invoice.invoiceId);
    const sendResult = await sendWatiDocument(input.customerPhoneRaw, pdf, `${input.invoice.invoiceNumber}.pdf`, `Invoice ${input.invoice.invoiceNumber}`);
    result = sendResult === 'sent' ? 'SENT' : 'FAILED';
  } catch (error) {
    console.error('[customerSelfService.documentSend]', error instanceof Error ? error.message : 'unknown error');
    result = 'FAILED';
  }

  try {
    await supabaseInsert('customer_document_sends', {
      customer_id: input.customerId,
      document_type: 'INVOICE_PDF',
      document_id: input.invoice.invoiceNumber,
      conversation_id: input.conversationId,
      wati_message_id: input.watiMessageId,
      sent_by: 'VIA',
    }, false);
  } catch (error) {
    console.error('[customerSelfService.documentSend] failed to write audit log:', error);
  }

  return result;
}
