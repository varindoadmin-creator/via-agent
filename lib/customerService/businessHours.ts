// ─── Varindo customer-service business hours ─────────────────────────────────
// VIA Customer Operations Phase 8, brief section 15: Varindo's own
// customer-communication calendar — deliberately separate from
// lib/integrations/wati/stock/operatingCalendar.ts's per-vendor calendars,
// so the two are never accidentally conflated. Same env-configurable-with-
// sensible-defaults shape as that module.

const JAKARTA_OFFSET_MINUTES = 7 * 60;

function envInt(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : undefined;
}

function config() {
  return {
    timezoneOffsetMinutes: envInt('CS_HOURS_TZ_OFFSET_MINUTES') ?? JAKARTA_OFFSET_MINUTES,
    workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat, matching Varindo's existing vendor-calendar default
    openHour: envInt('CS_HOURS_OPEN') ?? 8,
    closeHour: envInt('CS_HOURS_CLOSE') ?? 17,
  };
}

export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const { timezoneOffsetMinutes, workingDays, openHour, closeHour } = config();
  const local = new Date(now.getTime() + timezoneOffsetMinutes * 60_000);
  const day = local.getUTCDay();
  const hour = local.getUTCHours();
  return workingDays.includes(day) && hour >= openHour && hour < closeHour;
}
