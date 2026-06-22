// ─── Zoho Books API Types ─────────────────────────────────────────────────────

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface ZohoContact {
  contact_id: string;
  contact_name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  status: 'active' | 'inactive';
  contact_type: string;
  currency_code?: string;
  outstanding_receivable_amount?: number;
  billing_address?: ZohoAddress;
  shipping_address?: ZohoAddress;
}

export interface ZohoAddress {
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  fax?: string;
}

export interface ZohoContactListResponse {
  contacts: ZohoContact[];
  page_context?: ZohoPageContext;
}

// ─── Item ─────────────────────────────────────────────────────────────────────

export interface ZohoItem {
  item_id: string;
  name: string;
  sku?: string;
  description?: string;
  rate: number;
  purchase_rate?: number;
  unit?: string;
  status: 'active' | 'inactive';
  product_type?: string;
  item_type?: string;
  tax_id?: string;
  tax_name?: string;
  tax_percentage?: number;
  stock_on_hand?: number;
  available_stock?: number;
  reorder_level?: number;
  initial_stock?: number;
  initial_stock_rate?: number;
  image_document_id?: string;
  image_name?: string;
  image_type?: string;
  is_returnable?: boolean;
  account_id?: string;
  account_name?: string;
  inventory_account_id?: string;
  inventory_account_name?: string;
  vendor_id?: string;
  vendor_name?: string;
  purchase_account_id?: string;
  purchase_account_name?: string;
  purchase_description?: string;
  cf_brand?: string; // custom field: brand
  cf_item_code?: string; // custom field: item code
}

export interface ZohoItemListResponse {
  items: ZohoItem[];
  page_context?: ZohoPageContext;
}

export interface ZohoWarehouseStock {
  warehouse_id: string;
  warehouse_name: string;
  warehouse_stock_on_hand: number;
  warehouse_available_stock: number;
}

export interface ZohoItemWithStock extends ZohoItem {
  warehouse_details?: ZohoWarehouseStock[];
}

// ─── Sales Order ──────────────────────────────────────────────────────────────

export type ZohoSOStatus =
  | 'draft'
  | 'open'
  | 'invoiced'
  | 'partially_invoiced'
  | 'void'
  | 'overdue';

export interface ZohoSOLineItem {
  line_item_id?: string;
  item_id: string;
  name: string;
  description?: string;
  quantity: number;
  unit?: string;
  rate: number;
  amount: number;
  tax_id?: string;
  tax_name?: string;
  tax_percentage?: number;
  discount?: number;
  discount_amount?: number;
  item_order?: number;
  sku?: string;
}

export interface ZohoSalesOrder {
  salesorder_id: string;
  salesorder_number: string;
  reference_number?: string;
  date: string;
  status: ZohoSOStatus;
  customer_id: string;
  customer_name: string;
  currency_code: string;
  line_items: ZohoSOLineItem[];
  sub_total: number;
  total: number;
  tax_total?: number;
  discount?: number;
  discount_amount?: number;
  shipping_charge?: number;
  notes?: string;
  terms?: string;
  billing_address?: ZohoAddress;
  shipping_address?: ZohoAddress;
  shipment_date?: string;
  created_time?: string;
  last_modified_time?: string;
  delivery_method?: string;
  is_inclusive_tax?: boolean;
}

export interface ZohoCreateSOPayload {
  customer_id: string;
  date: string;
  reference_number?: string;
  line_items: Array<{
    item_id: string;
    quantity: number;
    rate: number;
    unit?: string;
    description?: string;
  }>;
  notes?: string;
  shipping_address?: ZohoAddress;
  delivery_method?: string;
  is_draft?: boolean;
}

export interface ZohoSOListResponse {
  salesorders: ZohoSalesOrder[];
  page_context?: ZohoPageContext;
}

export interface ZohoSOResponse {
  salesorder: ZohoSalesOrder;
}

// ─── Purchase Order ───────────────────────────────────────────────────────────

export type ZohoPOStatus =
  | 'draft'
  | 'open'
  | 'billed'
  | 'partially_billed'
  | 'cancelled';

export interface ZohoPOLineItem {
  line_item_id?: string;
  item_id?: string;
  name: string;
  description?: string;
  quantity: number;
  quantity_billed?: number;
  quantity_cancelled?: number;
  unit?: string;
  rate: number;
  amount: number;
  sku?: string;
}

export interface ZohoPurchaseOrder {
  purchaseorder_id: string;
  purchaseorder_number: string;
  reference_number?: string;
  date: string;
  status: ZohoPOStatus;
  vendor_id: string;
  vendor_name: string;
  currency_code: string;
  line_items: ZohoPOLineItem[];
  sub_total: number;
  total: number;
  notes?: string;
  expected_delivery_date?: string;
  created_time?: string;
}

export interface ZohoPOListResponse {
  purchaseorders: ZohoPurchaseOrder[];
  page_context?: ZohoPageContext;
}

// ─── Common ───────────────────────────────────────────────────────────────────

export interface ZohoPageContext {
  page: number;
  per_page: number;
  has_more_page: boolean;
  report_name?: string;
  applied_filter?: string;
  sort_column?: string;
  sort_order?: string;
}

export interface ZohoAPIError {
  code: number;
  message: string;
}

export interface ZohoAPIResponse<T> {
  code: number;
  message: string;
  data?: T;
}
