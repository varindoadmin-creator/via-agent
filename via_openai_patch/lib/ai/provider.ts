// ─── AI Provider Abstraction ──────────────────────────────────────────────────
// Supports Anthropic Claude and OpenAI.
// To swap providers, change AI_PROVIDER in .env.local.

export type AIProviderName = 'anthropic' | 'openai';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export interface AICompletionResult {
  content: string;
  provider: AIProviderName;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

function getProvider(): AIProviderName {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

  if (provider === 'openai' || provider === 'anthropic') {
    return provider;
  }

  throw new Error(`Unsupported AI_PROVIDER "${provider}". Use "anthropic" or "openai".`);
}

function getSystemContent(messages: AIMessage[], options: AICompletionOptions): string | undefined {
  return (
    options.system ||
    messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n') ||
    undefined
  );
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function anthropicCompletion(
  messages: AIMessage[],
  options: AICompletionOptions = {}
): Promise<AICompletionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const model = options.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  const maxTokens = options.maxTokens || 4096;

  const systemContent = getSystemContent(messages, options);
  const conversationMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: conversationMessages,
  };

  if (systemContent) body.system = systemContent;
  if (options.temperature !== undefined) body.temperature = options.temperature;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const content =
    data.content
      ?.filter((block: { type: string }) => block.type === 'text')
      ?.map((block: { text: string }) => block.text)
      ?.join('') || '';

  return {
    content,
    provider: 'anthropic',
    model: data.model || model,
    usage: {
      input_tokens: data.usage?.input_tokens,
      output_tokens: data.usage?.output_tokens,
      total_tokens:
        data.usage?.input_tokens !== undefined && data.usage?.output_tokens !== undefined
          ? data.usage.input_tokens + data.usage.output_tokens
          : undefined,
    },
  };
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

function toOpenAIInput(messages: AIMessage[], systemContent?: string) {
  const input: Array<{ role: 'developer' | 'user' | 'assistant'; content: string }> = [];

  if (systemContent) {
    input.push({ role: 'developer', content: systemContent });
  }

  for (const message of messages) {
    if (message.role === 'system') continue;
    input.push({ role: message.role, content: message.content });
  }

  return input;
}

function extractOpenAIText(data: Record<string, any>): string {
  if (typeof data.output_text === 'string') return data.output_text;

  const output = Array.isArray(data.output) ? data.output : [];
  return output
    .flatMap((item: any) => (Array.isArray(item.content) ? item.content : []))
    .filter((contentBlock: any) => contentBlock.type === 'output_text' || contentBlock.type === 'text')
    .map((contentBlock: any) => contentBlock.text || '')
    .join('');
}

async function openaiCompletion(
  messages: AIMessage[],
  options: AICompletionOptions = {}
): Promise<AICompletionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const maxTokens = options.maxTokens || 4096;
  const systemContent = getSystemContent(messages, options);

  const body: Record<string, unknown> = {
    model,
    input: toOpenAIInput(messages, systemContent),
    max_output_tokens: maxTokens,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${error}`);
  }

  const data = await response.json();
  const content = extractOpenAIText(data);

  return {
    content,
    provider: 'openai',
    model: data.model || model,
    usage: {
      input_tokens: data.usage?.input_tokens,
      output_tokens: data.usage?.output_tokens,
      total_tokens: data.usage?.total_tokens,
    },
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Send a completion request to the configured AI provider.
 */
export async function aiCompletion(
  messages: AIMessage[],
  options: AICompletionOptions = {}
): Promise<AICompletionResult> {
  const provider = getProvider();

  switch (provider) {
    case 'openai':
      return openaiCompletion(messages, options);
    case 'anthropic':
      return anthropicCompletion(messages, options);
  }
}

/**
 * Get the currently configured AI provider name.
 */
export function getAIProviderName(): AIProviderName {
  return getProvider();
}
