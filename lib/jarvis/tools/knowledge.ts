import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { JarvisKnowledgeService } from '@/lib/jarvis/knowledge/service';
import { detectPromptInjection, labelUntrustedContent } from '@/lib/jarvis/security/untrustedContent';
import { recordJarvisSecurityEvent } from '@/lib/jarvis/security/events';

const parameters = z.object({
  query: z.string().min(2).max(300),
  domain: z.string().trim().min(2).max(80).optional(),
  effective_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  include_historical: z.boolean().default(false),
  limit: z.number().int().min(1).max(8).default(5),
});
export const searchKnowledgeTool = tool<typeof parameters, JarvisRunContext>({
  name: 'search_knowledge',
  description: 'Search approved Varindo policies and source-linked Zoho Books reference knowledge. This is static knowledge, never a source for current prices, stock, balances, customers, or transaction status.',
  parameters,
  async execute({ query, domain, effective_at, include_historical, limit }, context) {
    const run = context?.context;
    if (!run) throw new Error('JARVIS run context is unavailable for governed knowledge retrieval.');
    const result = await new JarvisKnowledgeService().search({ organizationId: run.security.organizationId, role: run.role, query, domains: domain ? [domain] : undefined, effectiveAt: effective_at, includeHistorical: include_historical, limit });
    const matches = result.results.map(match => {
      const injection = detectPromptInjection(match.text);
      if (injection.detected) recordJarvisSecurityEvent(run.securityEvents, {
        timestamp: new Date().toISOString(), requestId: run.requestId, conversationId: run.conversationId,
        event: 'untrusted_content_detected', code: 'PROMPT_INJECTION_SIGNAL', subject: 'knowledge', details: { indicatorCount: injection.indicators.length },
      });
      return { ...match, text: labelUntrustedContent(match.text, 'knowledge') };
    });
    return { source_type: 'GOVERNED_KNOWLEDGE', live_business_data: false, matches, diagnostics: result.diagnostics };
  },
});
