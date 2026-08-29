import { Agent } from '@openai/agents';
import type { JarvisRunContext } from './context';
import { JARVIS_INSTRUCTIONS } from './instructions';
import { buildJarvisRoutingInstructions } from './orchestration';
import { buildJarvisContextInstructions } from './contextBuilder';
import { getJarvisToolsForNames } from './tools/registry';

export function createJarvisAgent(context: JarvisRunContext, options: { model?: string; maxOutputTokens?: number } = {}) {
  return new Agent<JarvisRunContext>({
    name: 'JARVIS',
    instructions: `${JARVIS_INSTRUCTIONS}\n\n${buildJarvisRoutingInstructions(context.orchestration)}\n\n${buildJarvisContextInstructions(context.contextPackage)}`,
    model: options.model || process.env.JARVIS_MODEL || 'gpt-5-mini',
    tools: getJarvisToolsForNames(context.role, context.contextPackage.availableToolNames),
    modelSettings: {
      toolChoice: 'auto',
      maxTokens: options.maxOutputTokens,
      // Retaining provider usage lets the centralized gateway attribute cost safely.
      preserveRawUsage: true,
    },
  });
}
