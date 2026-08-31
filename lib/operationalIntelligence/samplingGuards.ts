// ─── Small-sample & persistence protection ────────────────────────────────────
// VIA Customer Operations Phase 10, brief sections 35-36: shared by every
// detection rule so "conversion fell from 100% to 50% on 2 orders" or a
// 10-minute vendor blip never becomes a management alert.

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function minimumSampleSize(): number {
  return envNumber('OPERATIONAL_MIN_SAMPLE_SIZE', 10);
}

export function defaultPersistenceWindows(): number {
  return envNumber('OPERATIONAL_PERSISTENCE_WINDOWS', 2);
}

export function hasSufficientSample(sampleSize: number, minimum: number = minimumSampleSize()): boolean {
  return sampleSize >= minimum;
}

/**
 * True once a condition has been observed on `consecutiveBreachCount`
 * detection passes in a row — tracked on the finding row itself (brief
 * section 36's `persistenceWindows`), no separate history table required.
 */
export function hasPersisted(consecutiveBreachCount: number, requiredWindows: number = defaultPersistenceWindows()): boolean {
  return consecutiveBreachCount >= requiredWindows;
}

/** Brief section 43: do not resolve from one clean sample if noise is likely. */
export function hasRecovered(consecutiveNormalCount: number, requiredWindows: number = defaultPersistenceWindows()): boolean {
  return consecutiveNormalCount >= requiredWindows;
}
