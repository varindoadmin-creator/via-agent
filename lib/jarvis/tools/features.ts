import { tool } from '@openai/agents';
import { z } from 'zod';
import { findViaFeatures } from '@/lib/ai/featureRegistry';
import type { JarvisRunContext } from '@/lib/jarvis/context';

const parameters = z.object({
  query: z.string().min(2).max(200),
});

export const findViaFeatureTool = tool<typeof parameters, JarvisRunContext>({
  name: 'find_via_feature',
  description: 'Find the VIA page or feature that handles a task. Returns matching labels, paths, sections, and capabilities. Returns an empty matches array when none are known.',
  parameters: z.object({
    query: z.string().min(2).max(200).describe('The feature or task the user wants to find.'),
  }),
  async execute({ query }) {
    return {
      source: 'VIA feature registry',
      matches: findViaFeatures(query, 5),
    };
  },
});
