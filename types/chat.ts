// ─── Chat Types ──────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType =
  | 'text'
  | 'so_preview'
  | 'so_update_preview'
  | 'so_stock_po_check'
  | 'search_results'
  | 'action_result'
  | 'warning'
  | 'error';

export interface Attachment {
  name: string;
  type: string; // MIME type
  size: number;
  content?: string; // base64 or extracted text
  extractedText?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  metadata?: MessageMetadata;
  isLoading?: boolean;
  isError?: boolean;
}

export interface MessageMetadata {
  intent?: string;
  extractedOrder?: unknown;
  zohoData?: unknown;
  previewData?: unknown;
  actionResult?: unknown;
  warnings?: string[];
  debugInfo?: unknown;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatRequest {
  message: string;
  conversationId: string;
  attachments?: Attachment[];
  history?: Array<{ role: MessageRole; content: string }>;
  pendingAction?: PendingAction;
}

export interface ChatResponse {
  message: string;
  type: MessageType;
  metadata?: MessageMetadata;
  error?: string;
}

export interface PendingAction {
  type: 'create_so' | 'update_so';
  data: unknown;
  previewShown: boolean;
}
