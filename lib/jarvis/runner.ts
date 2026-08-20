import { run, setTracingDisabled } from '@openai/agents';
import { createJarvisAgent } from './agent';
import type { JarvisRunContext } from './context';
import { collectActionPreview, collectToolActivity } from './activity';

export interface JarvisHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunJarvisInput {
  message: string;
  history: JarvisHistoryMessage[];
  context: JarvisRunContext;
}

function buildConversationInput(history: JarvisHistoryMessage[], message: string): string {
  const transcript = history.slice(-20).map(entry => {
    const speaker = entry.role === 'assistant' ? 'JARVIS' : 'USER';
    return `${speaker}: ${entry.content.slice(0, 12_000)}`;
  });
  transcript.push(`USER: ${message.slice(0, 20_000)}`);
  return transcript.join('\n\n');
}

export async function runJarvis(input: RunJarvisInput) {
  setTracingDisabled(process.env.JARVIS_TRACING_ENABLED !== 'true');
  const result = await run(
    createJarvisAgent(),
    buildConversationInput(input.history, input.message),
    {
      context: input.context,
      maxTurns: Math.max(2, Math.min(12, Number(process.env.JARVIS_MAX_TURNS) || 8)),
    },
  );

  return {
    message: typeof result.finalOutput === 'string' && result.finalOutput.trim()
      ? result.finalOutput.trim()
      : 'I could not produce a verified answer. Please try again.',
    toolActivity: collectToolActivity(result.newItems),
    actionPreview: collectActionPreview(result.newItems),
    responseId: result.lastResponseId,
  };
}
