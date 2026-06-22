// ─── Order Extraction Types ───────────────────────────────────────────────────

export type OrderIntent =
  | 'create_so'
  | 'update_so'
  | 'price_check'
  | 'stock_check'
  | 'check_so_vs_stock_po'
  | 'search_customer'
  | 'search_item'
  | 'general_question';

export interface CustomerMatch {
  raw_name: string;
  matched_customer_id: string;
  matched_customer_name: string;
  confidence: number; // 0-1
  pricebook_id?: string;
  tier?: string;
  alternatives?: Array<{ id: string; name: string; confidence: number }>;
}

export interface ItemWarning {
  code: string;
  message: string;
}

export interface OrderItem {
  raw_text: string;
  brand: string;
  item_code: string;
  normalized_code: string;
  description: string;
  quantity: number;
  unit: string;
  customer_provided_price: number | null;
  official_price: number | null;
  official_price_currency: string;
  matched_item_id: string;
  matched_item_name: string;
  confidence: number; // 0-1
  warnings: ItemWarning[];
  stock_info?: StockInfo;
}

export interface DeliveryInfo {
  location: string;
  address: string;
  notes: string;
}

export interface ExtractedOrder {
  intent: OrderIntent;
  customer: CustomerMatch;
  items: OrderItem[];
  delivery: DeliveryInfo;
  missing_fields: string[];
  warnings: string[];
  recommended_next_action: string;
  raw_so_number?: string; // for update/check intents
}

// ─── SO Preview Types ─────────────────────────────────────────────────────────

export interface SOPreviewItem {
  item_id: string;
  item_name: string;
  item_code: string;
  quantity: number;
  unit: string;
  official_price: number;
  customer_provided_price: number | null;
  price_mismatch: boolean;
  line_total: number;
  warnings: string[];
}

export interface SOPreview {
  customer_id: string;
  customer_name: string;
  customer_confidence: number;
  items: SOPreviewItem[];
  subtotal: number;
  currency: string;
  delivery: DeliveryInfo;
  missing_fields: string[];
  warnings: string[];
  notes: string;
  requires_approval: 'APPROVE CREATE SO' | 'APPROVE UPDATE SO';
}

// ─── SO vs Stock/PO Check Types ───────────────────────────────────────────────

export type StockStatus = 'sufficient' | 'low' | 'unknown' | 'zero';
export type POStatus = 'has_open_po' | 'no_po' | 'unknown';
export type PurchaseRecommendation = 'ok' | 'order_needed' | 'check_po' | 'confirm_stock' | 'unknown';

export interface StockInfo {
  warehouse_name?: string;
  available_quantity?: number;
  status: StockStatus;
}

export interface SOItemCheckResult {
  item_id: string;
  item_code: string;
  item_name: string;
  so_quantity: number;
  unit: string;
  available_stock: number | null;
  stock_status: StockStatus;
  quantity_short: number;
  open_po_quantity: number;
  po_number: string | null;
  po_status: POStatus;
  has_been_purchased: boolean;
  recommendation: PurchaseRecommendation;
  recommendation_text: string;
  warnings: string[];
}

export interface SOStockPOCheck {
  so_number: string;
  so_id: string;
  customer_name: string;
  so_status: string;
  items: SOItemCheckResult[];
  overall_warnings: string[];
  summary: string;
}
