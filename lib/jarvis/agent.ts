import { Agent } from '@openai/agents';
import type { JarvisRunContext } from './context';
import { JARVIS_INSTRUCTIONS } from './instructions';
import { JARVIS_READ_TOOLS } from './tools/registry';

export function createJarvisAgent() {
  return new Agent<JarvisRunContext>({
    name: 'JARVIS',
    instructions: JARVIS_INSTRUCTIONS,
    model: process.env.JARVIS_MODEL || 'gpt-5-mini',
    tools: [...JARVIS_READ_TOOLS],
    modelSettings: {
      toolChoice: 'auto',
    },
  });
}
