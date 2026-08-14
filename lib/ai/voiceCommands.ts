import { normalizeSpokenItemCodes } from './phoneticMatching.ts';

export type VoicePendingAction = 'create_so' | 'update_so' | null;

/**
 * Converts natural spoken control phrases into VIA's existing guarded commands.
 * "OK, create" is only promoted to an approval when a create preview is pending.
 */
export function normalizeVoiceCommand(
  transcript: string,
  pendingAction: VoicePendingAction = null
): string {
  const withoutWakeWord = transcript
    .trim()
    .replace(/^(?:hello|hey|hi|halo|hai)\s*,?\s*(?:via|varindo)\s*[,.:;-]?\s*/i, '')
    .trim();

  if (!withoutWakeWord) return '';

  const controlPhrase = withoutWakeWord
    .toLowerCase()
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    pendingAction === 'create_so' &&
    /^(?:ok|okay)?\s*(?:please|tolong)?\s*(?:create|create it|create so|confirm|go ahead|buat|buatkan|lanjut buat)$/.test(controlPhrase)
  ) {
    return 'APPROVE CREATE SO';
  }

  if (
    pendingAction === 'update_so' &&
    /^(?:ok|okay)?\s*(?:please|tolong)?\s*(?:update|update it|update so|confirm|go ahead|ubah|lanjut ubah)$/.test(controlPhrase)
  ) {
    return 'APPROVE UPDATE SO';
  }

  // Normalize common Bahasa commands into the English phrasing used by the
  // order-intent pipeline. Customer names and item descriptions stay intact.
  return normalizeSpokenItemCodes(withoutWakeWord
    .replace(/^\s*(?:tolong\s+)?buat(?:kan)?\s+(?:sebuah\s+)?(?:sales\s*order|so)\s+(?:untuk|buat)\s+/i, 'Create Sales Order for ')
    .replace(/^\s*(?:tolong\s+)?buat(?:kan)?\s+(?:sebuah\s+)?(?:sales\s*order|so)\s+/i, 'Create Sales Order ')
    .replace(/\b(?:lembar|sheet|sheets)\b/gi, 'sheets')
    .replace(/\bukuran\s+standar\b/gi, 'standard size')
    .replace(/\bukuran\s+jumbo\b/gi, 'jumbo size')
    .replace(/\s+/g, ' ')
    .trim());
}
