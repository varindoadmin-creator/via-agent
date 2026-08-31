// ─── Baseline selection ────────────────────────────────────────────────────────
// VIA Customer Operations Phase 10, brief section 34: do not use one baseline
// for everything. Most rules compare against the immediately preceding
// equivalent period (lib/analytics/periods.ts's previousPeriod, already
// null-safe via comparePeriods). This module adds the two baseline types
// Phase 9 didn't need: a trailing multi-day window, and a configured/SLA
// target read from env — both computed via the SAME governed metric
// functions, never a duplicate calculation.

import type { DateRange } from '../analytics/periods.ts';

/** The N days immediately before `range.start` — one extra query, not a day-by-day scan (brief section 117). */
export function trailingWindow(range: DateRange, days: number): DateRange {
  const durationMs = days * 24 * 60 * 60_000;
  return { start: new Date(range.start.getTime() - durationMs), end: range.start };
}

export function trailing7DayWindow(range: DateRange): DateRange {
  return trailingWindow(range, 7);
}

export function trailing30DayWindow(range: DateRange): DateRange {
  return trailingWindow(range, 30);
}

/** A configured/SLA target, e.g. OPERATIONAL_TARGET_SLA_COMPLIANCE=0.9 — never hardcoded in a rule. */
export function configuredTarget(envName: string, fallback: number): number {
  const value = Number(process.env[envName]);
  return Number.isFinite(value) ? value : fallback;
}
