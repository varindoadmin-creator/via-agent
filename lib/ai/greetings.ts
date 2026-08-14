const GREETING_ONLY = /^(?:(?:hello|hi|hey|halo|hai)(?:\s*,?\s*(?:via|varindo))?)[.!?\s]*$/i;

export function getGreetingReply(message: string): string | null {
  const trimmed = message.trim();
  if (!GREETING_ONLY.test(trimmed)) return null;
  return /^(?:halo|hai)\b/i.test(trimmed)
    ? 'Halo, Pak. Ada yang bisa saya bantu hari ini?'
    : 'Hello, sir. What can I do for you today?';
}
