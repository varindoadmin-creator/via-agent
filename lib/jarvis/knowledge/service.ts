import { KNOWLEDGE_CATALOG } from './catalog.ts';
import { authorityWeight, canRetrieve } from './policy.ts';
import { InMemoryJarvisKnowledgeRepository, SupabaseJarvisKnowledgeRepository, type JarvisKnowledgeRepository } from './repository.ts';
import type { JarvisKnowledgeChunk, JarvisKnowledgeDocument, KnowledgeSearchDiagnostics, KnowledgeSearchInput, KnowledgeSearchResult } from './types.ts';

const GLOSSARY: Record<string, string> = { so: 'sales order', po: 'purchase order', ar: 'accounts receivable', sop: 'procedure', kebijakan: 'policy', prosedur: 'procedure', cara: 'how to' };
function terms(value: string) { const expanded = value.toLowerCase().replace(/\b(so|po|ar|sop|kebijakan|prosedur|cara)\b/g, word => `${word} ${GLOSSARY[word] || ''}`); return [...new Set(expanded.match(/[a-z0-9-]{2,}/g) || [])]; }
function staticRepository(organizationId: string) {
  const now = new Date().toISOString(); const documents: JarvisKnowledgeDocument[] = KNOWLEDGE_CATALOG.map(entry => ({ id: entry.id, organizationId, title: entry.title, sourceType: entry.domain === 'zoho' ? 'ZOHO_DOCUMENTATION' : 'COMPANY_REFERENCE', authority: entry.domain === 'zoho' ? 'REFERENCE' : 'APPROVED_INTERNAL', domain: entry.domain, version: 'repository-v1', status: 'ACTIVE', sourceUrl: entry.source.startsWith('http') ? entry.source : undefined, visibilityRoles: ['director', 'admin'], createdAt: now, updatedAt: now }));
  const chunks: JarvisKnowledgeChunk[] = KNOWLEDGE_CATALOG.map((entry, index) => ({ id: `${entry.id}:0`, documentId: entry.id, organizationId, text: entry.content, keywords: terms(`${entry.title} ${entry.content}`), claimKind: entry.id.includes('policy') ? 'OFFICIAL_RULE' : 'REFERENCE', chunkIndex: index, createdAt: now }));
  return new InMemoryJarvisKnowledgeRepository(documents, chunks);
}
export class JarvisKnowledgeService {
  private repository: JarvisKnowledgeRepository;
  constructor(repository: JarvisKnowledgeRepository = new SupabaseJarvisKnowledgeRepository()) { this.repository = repository; }
  async search(input: KnowledgeSearchInput): Promise<{ results: KnowledgeSearchResult[]; diagnostics: KnowledgeSearchDiagnostics }> {
    const started = Date.now(); const queryTerms = terms(input.query); const limit = Math.min(Math.max(input.limit || 4, 1), 6); const rejected: string[] = [];
    let documents: JarvisKnowledgeDocument[]; let chunks: JarvisKnowledgeChunk[];
    try { [documents, chunks] = await Promise.all([this.repository.listDocuments(input.organizationId), this.repository.listChunks(input.organizationId)]); }
    catch { const fallback = staticRepository(input.organizationId); [documents, chunks] = await Promise.all([fallback.listDocuments(input.organizationId), fallback.listChunks(input.organizationId)]); rejected.push('persistent_store_unavailable: used built-in approved reference only'); }
    const permitted = new Map(documents.filter(document => {
      const allowed = canRetrieve(document, input) && (!input.domains?.length || input.domains.includes(document.domain)) && (!input.sourceTypes?.length || input.sourceTypes.includes(document.sourceType));
      if (!allowed) rejected.push(`${document.id}: filtered by organization, role, status, date, or metadata`); return allowed;
    }).map(document => [document.id, document]));
    const candidates: KnowledgeSearchResult[] = [];
    for (const chunk of chunks) {
      const document = permitted.get(chunk.documentId); if (!document) continue;
      const bodyTerms = new Set([...chunk.keywords, ...terms(chunk.text)]); const exact = queryTerms.reduce((sum, word) => sum + (bodyTerms.has(word) ? 8 : 0), 0);
      const title = queryTerms.reduce((sum, word) => sum + (terms(document.title).includes(word) ? 12 : 0), 0);
      if (!exact && !title) continue;
      const freshness = document.effectiveFrom ? Math.max(0, Math.min(3, new Date(document.effectiveFrom).getFullYear() - 2020)) : 1;
      candidates.push({ chunkId: chunk.id, documentId: document.id, title: document.title, section: chunk.sectionPath || chunk.heading, page: chunk.page, text: chunk.text.slice(0, 2200), sourceType: document.sourceType, authority: document.authority, version: document.version, effectiveFrom: document.effectiveFrom, effectiveUntil: document.effectiveUntil, claimKind: chunk.claimKind, score: exact + title + authorityWeight[document.authority] + freshness, sourceUrl: document.sourceUrl });
    }
    const results = candidates.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
    return { results, diagnostics: { query: input.query, filters: { organizationId: input.organizationId, role: input.role, domains: input.domains, sourceTypes: input.sourceTypes, effectiveAt: input.effectiveAt, includeHistorical: input.includeHistorical }, retrieved: results.length, rejected: rejected.slice(0, 20), latencyMs: Date.now() - started } };
  }
}
