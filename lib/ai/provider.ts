// ─── AI Provider Abstraction ──────────────────────────────────────────────────
// Supports Anthropic Claude and OpenAI.
// To swap providers, change AI_PROVIDER in .env.local.

/** A single multimodal content block. `data` is raw base64 (no `data:` URI prefix). */
export type AIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string };

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  /** Plain text for every existing text-only caller; an array of blocks only for callers sending an image (system messages must stay plain text). */
  content: string | AIContentBlock[];
}

export interface AICompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export interface AICompletionResult {
  content: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
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

  // Separate system message from conversation. System messages are always
  // plain text in every caller (only user-role messages ever carry image
  // blocks), so this join is safe.
  const systemMessages = messages.filter((m) => m.role === 'system');
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const systemContent =
    options.system ||
    systemMessages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n') ||
    undefined;

  const toAnthropicContent = (content: string | AIContentBlock[]) => {
    if (typeof content === 'string') return content;
    return content.map(block => block.type === 'text'
      ? { type: 'text', text: block.text }
      : { type: 'image', source: { type: 'base64', media_type: block.mediaType, data: block.data } });
  };

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: conversationMessages.map((m) => ({
      role: m.role,
      content: toAnthropicContent(m.content),
    })),
  };

  if (systemContent) {
    body.system = systemContent;
  }

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

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
    model: data.model || model,
    usage: {
      input_tokens: data.usage?.input_tokens,
      output_tokens: data.usage?.output_tokens,
    },
  };
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

async function openaiCompletion(
  messages: AIMessage[],
  options: AICompletionOptions = {}
): Promise<AICompletionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = options.model || 'gpt-4o';
  const maxTokens = options.maxTokens || 4096;

  const toOpenAIContent = (content: string | AIContentBlock[]) => {
    if (typeof content === 'string') return content;
    return content.map(block => block.type === 'text'
      ? { type: 'text', text: block.text }
      : { type: 'image_url', image_url: { url: `data:${block.mediaType};base64,${block.data}` } });
  };

  // Add system message if provided
  const allMessages = options.system
    ? [{ role: 'system' as const, content: options.system }, ...messages]
    : messages;

  const body = {
    model,
    max_tokens: maxTokens,
    messages: allMessages.map(m => ({ role: m.role, content: toOpenAIContent(m.content) })),
    temperature: options.temperature ?? 0.2,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
  const content = data.choices?.[0]?.message?.content || '';

  return {
    content,
    model: data.model || model,
    usage: {
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
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
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

  switch (provider) {
    case 'openai':
      return openaiCompletion(messages, options);
    case 'anthropic':
    default:
      return anthropicCompletion(messages, options);
  }
}

/**
 * Get the currently configured AI provider name.
 */
export function getAIProviderName(): string {
  return (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
}
