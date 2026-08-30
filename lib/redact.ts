// ─── Shared log/text redaction ─────────────────────────────────────────────────
// Strips obvious email/phone patterns before customer or user text ever reaches
// logs. Originally an inline helper in lib/jarvis/production/feedback.ts.

export function redact(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[redacted-phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_000);
}
