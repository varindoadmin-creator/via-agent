import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { searchKnowledge } from '@/lib/jarvis/knowledge/catalog';

const parameters = z.object({ query: z.string().min(2).max(300), domain: z.enum(['varindo', 'zoho']).optional(), limit: z.number().int().min(1).max(8).default(5) });
export const searchKnowledgeTool = tool<typeof parameters, JarvisRunContext>({
  name: 'search_knowledge',
  description: 'Search approved Varindo policies and source-linked Zoho Books reference knowledge. This is static knowledge, never a source for current prices, stock, balances, customers, or transaction status.',
  parameters,
  async execute({ query, domain, limit }) {
    return { source_type: 'STATIC_APPROVED_KNOWLEDGE', live_business_data: false, matches: searchKnowledge(query, domain, limit) };
  },
});
