export const JARVIS_FAILURE_CODES = [
  'TRANSIENT',
  'PERMANENT',
  'VALIDATION',
  'AUTHORIZATION',
  'APPROVAL',
  'RATE_LIMIT',
  'TIMEOUT',
  'DEPENDENCY_UNAVAILABLE',
  'CONFLICT',
  'STALE_STATE',
  'INTERNAL',
] as const;

export type JarvisFailureCode = typeof JARVIS_FAILURE_CODES[number];

export class JarvisReliabilityError extends Error {
  public readonly code: JarvisFailureCode;
  public readonly options: { retryable?: boolean; dependency?: string; cause?: unknown };
  constructor(
    code: JarvisFailureCode,
    message: string,
    options: { retryable?: boolean; dependency?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'JarvisReliabilityError';
    this.code = code;
    this.options = options;
  }

  get retryable(): boolean { return Boolean(this.options.retryable); }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
}

export function classifyJarvisFailure(error: unknown): JarvisReliabilityError {
  if (error instanceof JarvisReliabilityError) return error;
  const message = messageOf(error);
  const status = Number((error as { status?: number; statusCode?: number } | undefined)?.status
    ?? (error as { statusCode?: number } | undefined)?.statusCode);
  if (status === 429 || message.includes('429') || message.includes('rate limit')) return new JarvisReliabilityError('RATE_LIMIT', 'The service is temporarily rate-limited.', { retryable: true, cause: error });
  if (status >= 500 || message.includes('fetch failed') || message.includes('econn') || message.includes('enotfound')) return new JarvisReliabilityError('TRANSIENT', 'A temporary dependency problem occurred.', { retryable: true, cause: error });
  if (message.includes('timeout') || message.includes('aborted')) return new JarvisReliabilityError('TIMEOUT', 'The dependency did not respond in time.', { retryable: true, cause: error });
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('permission denied')) return new JarvisReliabilityError('AUTHORIZATION', 'The request is not authorized.', { cause: error });
  if (status === 409 || message.includes('already used') || message.includes('conflict')) return new JarvisReliabilityError('CONFLICT', 'The requested action has already changed state.', { cause: error });
  if (message.includes('expired') || message.includes('stale') || message.includes('price changed')) return new JarvisReliabilityError('STALE_STATE', 'The prepared data is no longer current.', { cause: error });
  if (message.includes('approval')) return new JarvisReliabilityError('APPROVAL', 'Approval is required before this action can continue.', { cause: error });
  if (status >= 400 || message.includes('invalid') || message.includes('validation') || message.includes('not found') || message.includes('ambiguous')) return new JarvisReliabilityError('VALIDATION', 'The request data could not be validated.', { cause: error });
  return new JarvisReliabilityError('INTERNAL', 'An unexpected internal error occurred.', { cause: error });
}

export function safeFailureMessage(error: unknown): string {
  const failure = classifyJarvisFailure(error);
  if (failure.code === 'TIMEOUT' || failure.code === 'TRANSIENT' || failure.code === 'RATE_LIMIT') return 'JARVIS could not verify that information right now. No business record was changed.';
  if (failure.code === 'STALE_STATE') return 'The prepared data is no longer current. Please prepare a new preview before approving it.';
  return 'JARVIS could not complete that request safely. No business record was changed.';
}
