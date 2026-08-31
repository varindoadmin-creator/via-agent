import { COMPANY_IDENTITY } from '../../companyKnowledge/companyIdentity.ts';
import { BRAND_RELATIONSHIPS } from '../../companyKnowledge/brandRelationships.ts';
import { getActivePaymentDestination } from '../../companyKnowledge/paymentDestination.ts';
import { FREE_SHIPPING_JAVA_TEXT, SHIPPING_CONDITIONS_TEXT } from '../../companyKnowledge/shippingPolicy.ts';
import { APPROVED_HPL_BRANDS } from '../../companyKnowledge/productScope.ts';

export interface KnowledgeEntry {
  id: string;
  domain: 'varindo' | 'zoho';
  title: string;
  content: string;
  source: string;
  /** VIA Product/Pricing/Company Architecture brief section 5/59: company facts served to both internal Jarvis and (separately) WATI — this sourceType marks the entries generated from lib/companyKnowledge/*, the single canonical source for both channels. */
  sourceType?: 'COMPANY_REFERENCE';
}

const activePayment = getActivePaymentDestination();

export const KNOWLEDGE_CATALOG: KnowledgeEntry[] = [
  { id: 'varindo-operating-model', domain: 'varindo', title: 'Varindo operating model', source: 'VIA repository business rules', content: 'Varindo is an Indonesian interior-materials distributor. Zoho Books is the operational source of truth. VIA and JARVIS should reduce manual work and administrative errors without fabricating business facts.' },
  { id: 'varindo-stock-policy', domain: 'varindo', title: 'Stock policy', source: 'VIA repository JARVIS policy', content: 'Zoho inventory is system stock and must not be described as physically confirmed stock. Consequential stock and purchasing recommendations require human review.' },
  { id: 'varindo-pricing-policy', domain: 'varindo', title: 'Pricing policy', source: 'VIA repository pricing rules', content: 'Official selling price must be resolved from the customer, assigned price list or tier, and exact item. A price stated in a message or uploaded document is not authoritative.' },
  { id: 'varindo-approval-policy', domain: 'varindo', title: 'Action approval policy', source: 'VIA JARVIS approval policy', content: 'Reads and analysis need no approval. Preparing an action is allowed. Creating a Zoho Sales Order requires a separate exact approval. Deletes, voids, pricing changes, and bulk external communication are high risk and remain disabled.' },
  { id: 'zoho-contacts', domain: 'zoho', title: 'Zoho Books Contacts API', source: 'https://www.zoho.com/books/api/v3/contacts/', content: 'Contacts represent customers and vendors. Use list/search to resolve candidates and an exact contact ID for detail. Current customer data must be queried live.' },
  { id: 'zoho-items', domain: 'zoho', title: 'Zoho Books Items API', source: 'https://www.zoho.com/books/api/v3/items/', content: 'Items represent products and services. Exact item IDs are required for item detail and transactional lines. Current item status, rate, and stock must be queried live.' },
  { id: 'zoho-sales-orders', domain: 'zoho', title: 'Zoho Books Sales Orders API', source: 'https://www.zoho.com/books/api/v3/sales-order/', content: 'Sales Orders confirm an impending sale and contain customer, quantities, prices, and delivery information. List results are summaries; exact line details require the individual Sales Order endpoint.' },
  { id: 'zoho-purchase-orders', domain: 'zoho', title: 'Zoho Books Purchase Orders API', source: 'https://www.zoho.com/books/api/v3/purchase-order/', content: 'Purchase Orders are buyer-issued documents to vendors. Open quantities must be derived from exact PO line details and must not be treated as stock already received.' },
  { id: 'zoho-invoices', domain: 'zoho', title: 'Zoho Books Invoices API', source: 'https://www.zoho.com/books/api/v3/invoices/', content: 'Invoices include status, date, due date, total, balance, customer, location, and line details. Draft and void invoices are excluded from VIA issued-invoice sales and GP analytics.' },
  { id: 'zoho-pagination', domain: 'zoho', title: 'Zoho Books pagination', source: 'https://www.zoho.com/books/api/v3/pagination/', content: 'List API pagination is described by page_context. JARVIS tools disclose incomplete coverage instead of treating a capped first page as a complete result.' },
  { id: 'zoho-oauth', domain: 'zoho', title: 'Zoho Books OAuth', source: 'https://www.zoho.com/books/api/v3/oauth/', content: 'Zoho Books APIs use OAuth scopes and server-side access tokens. Refresh credentials and secrets must never be exposed to the browser or knowledge responses.' },
  {
    id: 'varindo-company-identity', domain: 'varindo', title: 'Company identity & offices', sourceType: 'COMPANY_REFERENCE',
    source: 'lib/companyKnowledge/companyIdentity.ts',
    content: `Legal entity: ${COMPANY_IDENTITY.legalName}. Head office: ${COMPANY_IDENTITY.headOffice.lines.join(', ')} (T. ${COMPANY_IDENTITY.headOffice.phone}). Registered office: ${COMPANY_IDENTITY.registeredOffice.lines.join(', ')} (T. ${COMPANY_IDENTITY.registeredOffice.phone}). Contact: ${COMPANY_IDENTITY.contact.email}, ${COMPANY_IDENTITY.contact.website}.`,
  },
  {
    id: 'varindo-brand-relationships', domain: 'varindo', title: 'Brand relationships & dealer status', sourceType: 'COMPANY_REFERENCE',
    source: 'lib/companyKnowledge/brandRelationships.ts',
    content: `${BRAND_RELATIONSHIPS.LAMITAK.dealerStatement} Website: ${BRAND_RELATIONSHIPS.LAMITAK.website}. ${BRAND_RELATIONSHIPS.EDL.dealerStatement} Website: ${BRAND_RELATIONSHIPS.EDL.website}. Never upgrade either statement to exclusive/sole/master distributor unless separately approved. Varindo's approved commercial scope is HPL from ${APPROVED_HPL_BRANDS.join(' and ')} only — no other HPL brands, and no unrelated products such as plywood.`,
  },
  {
    id: 'varindo-shipping-policy', domain: 'varindo', title: 'Shipping policy', sourceType: 'COMPANY_REFERENCE',
    source: 'lib/companyKnowledge/shippingPolicy.ts',
    content: `Orders before 14:00 WIB Monday-Friday: Jabodetabek ships next working day (max 2 working days); outside Jabodetabek is handed to a logistics partner next working day (max 2 working days). Orders after 14:00 WIB or on non-working days: Jabodetabek ships within 2 working days; outside Jabodetabek is handed to a logistics partner within 2 working days. ${FREE_SHIPPING_JAVA_TEXT} ${SHIPPING_CONDITIONS_TEXT} Always distinguish dispatch/handoff-to-logistics from actual arrival — never promise an arrival date from dispatch policy alone.`,
  },
  {
    id: 'varindo-payment-destination', domain: 'varindo', title: 'Payment destination', sourceType: 'COMPANY_REFERENCE',
    source: 'lib/companyKnowledge/paymentDestination.ts',
    content: activePayment ? `Approved active payment destination: Bank ${activePayment.bank}, a/n ${activePayment.accountName}, No. Rek. ${activePayment.accountNumber}, ${activePayment.branch}. Only an ACTIVE approved bank destination may ever be shared externally. This is distinct from payment status ("sudah masuk?"), which uses Phase 7's live Zoho payment data, never this static record.` : 'No active payment destination is currently configured.',
  },
];

function terms(value: string): string[] { return value.toLowerCase().match(/[a-z0-9]+/g) || []; }
export function searchKnowledge(query: string, domain?: 'varindo' | 'zoho', limit = 5) {
  const queryTerms = terms(query);
  return KNOWLEDGE_CATALOG
    .filter(entry => !domain || entry.domain === domain)
    .map(entry => ({ entry, score: queryTerms.reduce((score, term) => score + (terms(`${entry.title} ${entry.content}`).includes(term) ? 1 : 0), 0) }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map(result => result.entry);
}
