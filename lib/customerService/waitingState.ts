// ─── Derived waiting-state label ─────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief sections 19-22: WAITING_CUSTOMER /
// WAITING_INTERNAL / WAITING_VENDOR are display-only labels for the admin
// queue, computed by reading Phase 3/6/7's own existing tables — never a
// second state machine (brief section 22's explicit prohibition on
// duplicating Phase 3's vendor state).

import { supabaseSelect } from '../supabase/rest.ts';

export type WaitingState = 'WAITING_CUSTOMER' | 'WAITING_INTERNAL' | 'WAITING_VENDOR' | null;

interface StockInquiryRow { status: string }
interface CommercialDraftRow { status: string }
interface CustomerDraftRow { status: string }

const VENDOR_WAITING_STOCK_STATUSES = ['WAITING_FOR_VENDOR', 'VENDOR_CLOSED', 'READY_FOR_VENDOR_CHECK', 'CHECKING_VARINDO_STOCK'];
const CUSTOMER_WAITING_STOCK_STATUSES = ['NEEDS_QUANTITY'];
const CUSTOMER_WAITING_COMMERCIAL_STATUSES = ['NEEDS_CUSTOMER', 'NEEDS_PRODUCT', 'NEEDS_QUANTITY', 'NEEDS_PRICE', 'NEEDS_DELIVERY_INFO', 'CUSTOMER_ONBOARDING'];
const INTERNAL_WAITING_COMMERCIAL_STATUSES = ['READY_FOR_REVIEW', 'WAITING_FOR_APPROVAL', 'APPROVED', 'EXECUTING'];
const CUSTOMER_WAITING_ONBOARDING_STATUSES = ['COLLECTING_COMPANY', 'COLLECTING_TAX_REQUIREMENT', 'COLLECTING_NPWP', 'COLLECTING_BILLING_ADDRESS', 'COLLECTING_SHIPPING_ADDRESS'];
const INTERNAL_WAITING_ONBOARDING_STATUSES = ['POSSIBLE_DUPLICATE', 'READY_FOR_REVIEW', 'WAITING_FOR_APPROVAL', 'APPROVED', 'CREATING_ZOHO_CUSTOMER'];

/**
 * Priority order when more than one signal is present: vendor > internal >
 * customer, since a human waiting on Finance/Sales approval is the most
 * actionable-by-staff signal, and a vendor dependency is entirely outside
 * anyone's control until the vendor responds.
 */
export async function deriveWaitingState(input: { conversationId: string; hasPendingSelfService: boolean }): Promise<WaitingState> {
  const [stockInquiries, commercialDrafts, customerDrafts] = await Promise.all([
    supabaseSelect<StockInquiryRow>('stock_inquiries', `conversation_id=eq.${encodeURIComponent(input.conversationId)}&status=not.in.(CLOSED,CANCELLED,FAILED)&select=status&order=created_at.desc&limit=1`).catch(() => []),
    supabaseSelect<CommercialDraftRow>('commercial_drafts', `conversation_id=eq.${encodeURIComponent(input.conversationId)}&status=not.in.(COMPLETED,FAILED,CANCELLED,STALE)&select=status&order=updated_at.desc&limit=1`).catch(() => []),
    supabaseSelect<CustomerDraftRow>('customer_drafts', `normalized_phone=eq.${encodeURIComponent(input.conversationId)}&status=not.in.(CUSTOMER_CREATED,FAILED,CANCELLED)&select=status&order=updated_at.desc&limit=1`).catch(() => []),
  ]);

  const stockStatus = stockInquiries[0]?.status;
  const commercialStatus = commercialDrafts[0]?.status;
  const customerStatus = customerDrafts[0]?.status;

  if (stockStatus && VENDOR_WAITING_STOCK_STATUSES.includes(stockStatus)) return 'WAITING_VENDOR';
  if (commercialStatus && INTERNAL_WAITING_COMMERCIAL_STATUSES.includes(commercialStatus)) return 'WAITING_INTERNAL';
  if (customerStatus && INTERNAL_WAITING_ONBOARDING_STATUSES.includes(customerStatus)) return 'WAITING_INTERNAL';
  if (stockStatus && CUSTOMER_WAITING_STOCK_STATUSES.includes(stockStatus)) return 'WAITING_CUSTOMER';
  if (commercialStatus && CUSTOMER_WAITING_COMMERCIAL_STATUSES.includes(commercialStatus)) return 'WAITING_CUSTOMER';
  if (customerStatus && CUSTOMER_WAITING_ONBOARDING_STATUSES.includes(customerStatus)) return 'WAITING_CUSTOMER';
  if (input.hasPendingSelfService) return 'WAITING_CUSTOMER';

  return null;
}
