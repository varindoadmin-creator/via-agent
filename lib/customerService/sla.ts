// ─── Customer-service case SLA ───────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief sections 14-18: mirrors
// lib/integrations/wati/stock/sla.ts's exact deterministic, env-configurable
// shape — a second, independent SLA clock for human handoffs (Phase 3's
// vendor-check SLA is unrelated and untouched).

import { isWithinBusinessHours } from './businessHours.ts';

export type CaseSlaStatus = 'ON_TIME' | 'WARNING' | 'BREACHED';

function envMinutes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function caseSlaWarningMinutes(): number {
  return envMinutes('CS_SLA_WARNING_MINUTES', 15);
}

export function caseSlaBreachMinutes(): number {
  return envMinutes('CS_SLA_BREACH_MINUTES', 60);
}

/** Brief section 15: the clock runs continuously by default; set CS_SLA_PAUSE_OUTSIDE_HOURS=true to pause it outside Varindo's own business hours. Never hardcoded — both behaviors are real and configurable. */
function pausesOutsideBusinessHours(): boolean {
  return process.env.CS_SLA_PAUSE_OUTSIDE_HOURS === 'true';
}

/**
 * Elapsed "clock" minutes between two instants, optionally excluding any
 * time spent outside business hours. Walks hour-by-hour (bounded to 30 days)
 * rather than a closed-form calculation, since business hours can vary by
 * day of week — simple and correct over realistic SLA windows.
 */
function elapsedClockMinutes(from: Date, to: Date): number {
  if (!pausesOutsideBusinessHours()) return (to.getTime() - from.getTime()) / 60_000;
  if (to <= from) return 0;

  let minutes = 0;
  const stepMs = 60_000;
  const maxSteps = 30 * 24 * 60; // 30 days of minute-steps, a generous bound
  let cursor = from.getTime();
  const end = to.getTime();
  for (let i = 0; i < maxSteps && cursor < end; i++, cursor += stepMs) {
    if (isWithinBusinessHours(new Date(cursor))) minutes += 1;
  }
  return minutes;
}

export function computeCaseSlaStatus(handoffCreatedAt: Date, now: Date = new Date()): CaseSlaStatus {
  const ageMinutes = elapsedClockMinutes(handoffCreatedAt, now);
  if (ageMinutes >= caseSlaBreachMinutes()) return 'BREACHED';
  if (ageMinutes >= caseSlaWarningMinutes()) return 'WARNING';
  return 'ON_TIME';
}
