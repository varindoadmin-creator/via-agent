import type { KnowledgeSearchInput, JarvisKnowledgeDocument } from './types.ts';

const LIVE_FACT = /\b(current\s+)?(stock|stok|balance|saldo|invoice status|status invoice|price|harga|sales|penjualan|revenue|omzet|purchase order status|po status)\b/i;
const KNOWLEDGE_HINT = /\b(how to|cara|policy|kebijakan|procedure|prosedur|sop|guideline|panduan|what does|apa arti|apa itu|definition|definisi|approval rule|aturan approval|approval|approve)\b/i;
export function needsKnowledgeRetrieval(request: string): boolean { return KNOWLEDGE_HINT.test(request) && !LIVE_FACT.test(request); }
export function isEffective(document: JarvisKnowledgeDocument, at: string, includeHistorical = false): boolean {
  if (document.status === 'ARCHIVED' || document.authority === 'ARCHIVED') return includeHistorical;
  if (!includeHistorical && document.status !== 'ACTIVE') return false;
  if (document.effectiveFrom && document.effectiveFrom > at) return false;
  if (!includeHistorical && document.effectiveUntil && document.effectiveUntil < at) return false;
  return true;
}
export function canRetrieve(document: JarvisKnowledgeDocument, input: KnowledgeSearchInput): boolean {
  return document.organizationId === input.organizationId && document.visibilityRoles.includes(input.role) && isEffective(document, input.effectiveAt || new Date().toISOString().slice(0, 10), input.includeHistorical);
}
export function containsUnsafeKnowledge(text: string): boolean { return /(api[_ -]?key|password|secret|oauth[_ -]?token|ignore (all|previous) instructions|system prompt)/i.test(text); }
export const authorityWeight: Record<JarvisKnowledgeDocument['authority'], number> = { OFFICIAL: 40, APPROVED_INTERNAL: 30, REFERENCE: 20, DRAFT: 5, ARCHIVED: 0 };
