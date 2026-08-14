export const DEFAULT_OPENAI_SPEECH_MODEL = 'gpt-audio-1.5';
export const DEFAULT_OPENAI_SPEECH_VOICE = 'shimmer';

export const VIA_SPEECH_INSTRUCTIONS = [
  'Speak only the supplied reply text.',
  'Use a youthful adult feminine voice that is warm, friendly, confident, and conversational.',
  'Sound natural rather than robotic, with relaxed pacing and subtle expression.',
  'Use native Indonesian pronunciation for Bahasa Indonesia.',
  'Always pronounce the assistant name VIA as vee-ah, never vai-ah.',
  'Pronounce English business terms in natural English, including Sales Order, Invoice, Purchase Order, Gross Profit, revenue, discount, customer, item, stock, draft, and approval.',
  'Read product codes, quantities, and numbers clearly.',
].join(' ');

export function buildOpenAISpeechRequest(
  text: string,
  options: { model?: string; voice?: string } = {}
) {
  return {
    model: options.model || DEFAULT_OPENAI_SPEECH_MODEL,
    modalities: ['text', 'audio'] as const,
    audio: {
      voice: options.voice || DEFAULT_OPENAI_SPEECH_VOICE,
      format: 'mp3' as const,
    },
    messages: [
      { role: 'system' as const, content: VIA_SPEECH_INSTRUCTIONS },
      { role: 'user' as const, content: text },
    ],
  };
}

export function decodeBase64Audio(data: string): Uint8Array {
  return Uint8Array.from(Buffer.from(data, 'base64'));
}
