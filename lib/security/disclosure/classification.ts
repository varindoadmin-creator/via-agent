// ─── Data classification & policy matrix ────────────────────────────────────────
// Brief section 4/13: a standardized classification model plus a centrally
// defined, extensible policy registry. This is data about VIA's own business
// concepts — it does not depend on Jarvis, WATI, or any specific pipeline, so
// both the WATI customer-operations path and any future internal tool-gating
// can reference the same source of truth.

export type DataClassification = 'PUBLIC' | 'CUSTOMER_SHAREABLE' | 'CUSTOMER_SCOPED' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export type DataCategory =
  | 'PRODUCT_INFO' | 'PUBLIC_CATALOGUE' | 'BUSINESS_HOURS'
  | 'APPROVED_PRICE' | 'CUSTOMER_SAFE_STOCK'
  | 'EXACT_STOCK' | 'SUPPLIER_COST' | 'PURCHASE_PRICE' | 'MARGIN' | 'MARKUP' | 'DISCOUNT_FLOOR'
  | 'COMPANY_SALES' | 'BRAND_SALES' | 'SALESPERSON_PERFORMANCE' | 'INVENTORY_VALUE' | 'INTERNAL_NOTES'
  | 'OWN_ORDER_STATUS' | 'OWN_INVOICE' | 'OWN_PAYMENT_STATUS'
  | 'OTHER_CUSTOMER_DATA' | 'CREDENTIALS';

export interface PolicyMatrixEntry {
  category: DataCategory;
  label: string;
  classification: DataClassification;
  /** Human-readable summary of the external-customer decision — the actual decision logic lives in policy.ts. */
  externalSummary: 'Allow' | 'Deny' | 'Conditional Allow';
}

/** Brief section 13's initial data policy matrix, made extensible — add rows here, not scattered checks elsewhere. */
export const POLICY_MATRIX: readonly PolicyMatrixEntry[] = [
  { category: 'PRODUCT_INFO', label: 'Product name / description', classification: 'PUBLIC', externalSummary: 'Allow' },
  { category: 'PUBLIC_CATALOGUE', label: 'Public catalogue info', classification: 'PUBLIC', externalSummary: 'Allow' },
  { category: 'BUSINESS_HOURS', label: 'Business hours', classification: 'PUBLIC', externalSummary: 'Allow' },
  { category: 'APPROVED_PRICE', label: 'Approved customer selling price', classification: 'CUSTOMER_SHAREABLE', externalSummary: 'Allow' },
  { category: 'CUSTOMER_SAFE_STOCK', label: 'Customer-safe stock result', classification: 'CUSTOMER_SHAREABLE', externalSummary: 'Allow' },
  { category: 'EXACT_STOCK', label: 'Exact vendor/Varindo stock', classification: 'CONFIDENTIAL', externalSummary: 'Deny' },
  { category: 'SUPPLIER_COST', label: 'Supplier cost', classification: 'CONFIDENTIAL', externalSummary: 'Deny' },
  { category: 'PURCHASE_PRICE', label: 'Purchase price', classification: 'CONFIDENTIAL', externalSummary: 'Deny' },
  { category: 'MARGIN', label: 'Margin', classification: 'CONFIDENTIAL', externalSummary: 'Deny' },
  { category: 'MARKUP', label: 'Markup', classification: 'CONFIDENTIAL', externalSummary: 'Deny' },
  { category: 'DISCOUNT_FLOOR', label: 'Discount floor', classification: 'CONFIDENTIAL', externalSummary: 'Deny' },
  { category: 'COMPANY_SALES', label: 'Company sales', classification: 'INTERNAL', externalSummary: 'Deny' },
  { category: 'BRAND_SALES', label: 'Brand sales', classification: 'INTERNAL', externalSummary: 'Deny' },
  { category: 'SALESPERSON_PERFORMANCE', label: 'Salesperson performance', classification: 'INTERNAL', externalSummary: 'Deny' },
  { category: 'INVENTORY_VALUE', label: 'Inventory value', classification: 'INTERNAL', externalSummary: 'Deny' },
  { category: 'INTERNAL_NOTES', label: 'Internal notes', classification: 'INTERNAL', externalSummary: 'Deny' },
  { category: 'OWN_ORDER_STATUS', label: "Customer's own order status", classification: 'CUSTOMER_SCOPED', externalSummary: 'Conditional Allow' },
  { category: 'OWN_INVOICE', label: "Customer's own invoice", classification: 'CUSTOMER_SCOPED', externalSummary: 'Conditional Allow' },
  { category: 'OWN_PAYMENT_STATUS', label: "Customer's own payment status", classification: 'CUSTOMER_SCOPED', externalSummary: 'Conditional Allow' },
  { category: 'OTHER_CUSTOMER_DATA', label: "Another customer's orders/invoices/AR/sales", classification: 'RESTRICTED', externalSummary: 'Deny' },
  { category: 'CREDENTIALS', label: 'Credentials / API tokens / secrets', classification: 'RESTRICTED', externalSummary: 'Deny' },
];

const BY_CATEGORY = new Map(POLICY_MATRIX.map(entry => [entry.category, entry]));

export function classificationForCategory(category: DataCategory): DataClassification {
  const entry = BY_CATEGORY.get(category);
  // Fail closed: an unregistered category is treated as the most sensitive
  // tier rather than silently permitted (brief section 35).
  return entry?.classification ?? 'RESTRICTED';
}
