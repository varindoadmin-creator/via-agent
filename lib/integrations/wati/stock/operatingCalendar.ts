// ─── Vendor operating calendar ────────────────────────────────────────────────────
// Brief section 20: vendor stock-check hours are a separate concept from
// Varindo's own customer-service hours — never assume they're the same.
// V1 is a code/env config, not a DB-backed admin-editable calendar (documented
// limitation in docs/customer-operations-stock.md) — sensible defaults per the
// brief's own "provide sensible configurable defaults if needed" allowance.

export interface VendorHours {
  timezoneOffsetMinutes: number; // e.g. 420 for Asia/Jakarta (UTC+7)
  workingDays: number[]; // 0 (Sun) - 6 (Sat)
  openHour: number; // local hour, 0-23
  closeHour: number; // local hour, 0-23 (exclusive)
}

const JAKARTA_OFFSET_MINUTES = 7 * 60;

const DEFAULT_HOURS: VendorHours = {
  timezoneOffsetMinutes: JAKARTA_OFFSET_MINUTES,
  workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
  openHour: 8,
  closeHour: 17,
};

function envInt(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : undefined;
}

function hoursForSource(source: string): VendorHours {
  const key = source.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return {
    timezoneOffsetMinutes: envInt(`VENDOR_HOURS_${key}_TZ_OFFSET_MINUTES`) ?? DEFAULT_HOURS.timezoneOffsetMinutes,
    workingDays: DEFAULT_HOURS.workingDays,
    openHour: envInt(`VENDOR_HOURS_${key}_OPEN`) ?? DEFAULT_HOURS.openHour,
    closeHour: envInt(`VENDOR_HOURS_${key}_CLOSE`) ?? DEFAULT_HOURS.closeHour,
  };
}

function localParts(date: Date, offsetMinutes: number): { day: number; hour: number } {
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  return { day: local.getUTCDay(), hour: local.getUTCHours() };
}

export function isSourceOpen(source: string, now: Date = new Date()): boolean {
  const hours = hoursForSource(source);
  const { day, hour } = localParts(now, hours.timezoneOffsetMinutes);
  return hours.workingDays.includes(day) && hour >= hours.openHour && hour < hours.closeHour;
}

/** Next local opening time, walking forward day-by-day (bounded to avoid an infinite loop on bad config). */
export function nextOpeningTime(source: string, now: Date = new Date()): Date {
  const hours = hoursForSource(source);
  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const candidateUtc = new Date(now.getTime() + dayOffset * 24 * 60 * 60_000);
    const { day } = localParts(candidateUtc, hours.timezoneOffsetMinutes);
    if (!hours.workingDays.includes(day)) continue;
    // Build the candidate's local midnight, then add the open hour, then convert back to UTC.
    const localMidnightUtcMs = candidateUtc.getTime() + hours.timezoneOffsetMinutes * 60_000;
    const localDayStart = new Date(localMidnightUtcMs);
    localDayStart.setUTCHours(0, 0, 0, 0);
    const openingLocal = new Date(localDayStart.getTime() + hours.openHour * 60 * 60_000);
    const openingUtc = new Date(openingLocal.getTime() - hours.timezoneOffsetMinutes * 60_000);
    if (openingUtc.getTime() > now.getTime()) return openingUtc;
  }
  // Fallback — should be unreachable with sane config, but never throw over a calendar edge case.
  return new Date(now.getTime() + 24 * 60 * 60_000);
}
