import { createHash, randomUUID } from 'node:crypto';
import type { JarvisKnowledgeChunk, JarvisKnowledgeDocument, KnowledgeClaimKind, KnowledgeSourceType } from './types.ts';
import { containsUnsafeKnowledge } from './policy.ts';

export function normalizeKnowledgeText(value: string): string { return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
function heading(line: string) { return /^(#{1,6}\s+|\d+(?:\.\d+)*[.)]\s+|[A-Z][A-Z\s]{5,}:?$)/.test(line.trim()); }
function claimKind(sourceType: KnowledgeSourceType): KnowledgeClaimKind { return sourceType === 'POLICY' || sourceType === 'PRICING_RULE' ? 'OFFICIAL_RULE' : sourceType === 'SOP' ? 'PROCEDURE' : sourceType === 'FAQ' ? 'DEFINITION' : 'REFERENCE'; }
/** Structural, heading-first chunks. Tables remain intact as consecutive lines under their heading. */
export function chunkKnowledge(document: JarvisKnowledgeDocument, rawText: string): JarvisKnowledgeChunk[] {
  const text = normalizeKnowledgeText(rawText); if (!text) throw new Error('Knowledge document has no extractable text.'); if (containsUnsafeKnowledge(text)) throw new Error('Knowledge ingestion rejected sensitive credentials or instruction-like content.');
  const sections: Array<{ heading?: string; text: string }> = []; let current = ''; let currentHeading: string | undefined;
  for (const line of text.split('\n')) { if (heading(line) && current.trim()) { sections.push({ heading: currentHeading, text: current.trim() }); current = ''; currentHeading = line.trim(); } else { current += `${line}\n`; } }
  if (current.trim()) sections.push({ heading: currentHeading, text: current.trim() });
  const now = new Date().toISOString(); const chunks: JarvisKnowledgeChunk[] = [];
  for (const section of sections) { for (let offset = 0; offset < section.text.length; offset += 1800) { const slice = section.text.slice(offset, offset + 2200); chunks.push({ id: randomUUID(), documentId: document.id, organizationId: document.organizationId, heading: section.heading, sectionPath: section.heading, text: slice, keywords: [...new Set((`${section.heading || ''} ${slice}`).toLowerCase().match(/[a-z0-9-]{2,}/g) || [])].slice(0, 80), claimKind: claimKind(document.sourceType), chunkIndex: chunks.length, createdAt: now }); } }
  return chunks;
}
export function checksumKnowledge(value: string): string { return createHash('sha256').update(normalizeKnowledgeText(value)).digest('hex'); }
