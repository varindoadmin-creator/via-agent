export const KNOWLEDGE_SOURCE_TYPES = ['POLICY', 'SOP', 'PRODUCT_DOCUMENTATION', 'PRICING_RULE', 'SALES_GUIDELINE', 'OPERATIONS_GUIDELINE', 'FINANCE_GUIDELINE', 'ZOHO_DOCUMENTATION', 'TRAINING_MATERIAL', 'COMPANY_REFERENCE', 'FAQ'] as const;
export const KNOWLEDGE_AUTHORITIES = ['OFFICIAL', 'APPROVED_INTERNAL', 'REFERENCE', 'DRAFT', 'ARCHIVED'] as const;
export const KNOWLEDGE_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED'] as const;

export type KnowledgeSourceType = typeof KNOWLEDGE_SOURCE_TYPES[number];
export type KnowledgeAuthority = typeof KNOWLEDGE_AUTHORITIES[number];
export type KnowledgeStatus = typeof KNOWLEDGE_STATUSES[number];
export type KnowledgeClaimKind = 'OFFICIAL_RULE' | 'PROCEDURE' | 'REFERENCE' | 'EXAMPLE' | 'DEFINITION';

export interface JarvisKnowledgeDocument {
  id: string; organizationId: string; title: string; sourceType: KnowledgeSourceType; authority: KnowledgeAuthority;
  domain: string; department?: string; version: string; status: KnowledgeStatus; owner?: string;
  sourceUrl?: string; fileReference?: string; supersedesDocumentId?: string; effectiveFrom?: string; effectiveUntil?: string | null;
  visibilityRoles: string[]; checksum?: string; createdAt: string; updatedAt: string;
}

export interface JarvisKnowledgeChunk {
  id: string; documentId: string; organizationId: string; heading?: string; sectionPath?: string; page?: number;
  text: string; keywords: string[]; claimKind: KnowledgeClaimKind; chunkIndex: number; createdAt: string;
}

export interface KnowledgeSearchInput {
  organizationId: string; role: string; query: string; domains?: string[]; sourceTypes?: KnowledgeSourceType[];
  effectiveAt?: string; includeHistorical?: boolean; limit?: number;
}

export interface KnowledgeSearchResult {
  chunkId: string; documentId: string; title: string; section?: string; page?: number; text: string;
  sourceType: KnowledgeSourceType; authority: KnowledgeAuthority; version: string; effectiveFrom?: string;
  effectiveUntil?: string | null; claimKind: KnowledgeClaimKind; score: number; sourceUrl?: string;
}

export interface KnowledgeSearchDiagnostics { query: string; filters: Record<string, unknown>; retrieved: number; rejected: string[]; latencyMs: number; }
