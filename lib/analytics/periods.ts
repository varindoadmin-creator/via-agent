// ─── Date ranges & safe period comparison ────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 36-37, 101, 79: one shared
// date-boundary implementation so dashboards and Jarvis never disagree, safe
// zero-denominator percentage-change handling, and small-sample flagging.

const JAKARTA_OFFSET_MINUTES = 7 * 60;

export type TimeGrain = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';

export interface DateRange {
  start: Date;
  end: Date;
}

function toJakarta(date: Date): Date {
  return new Date(date.getTime() + JAKARTA_OFFSET_MINUTES * 60_000);
}
function fromJakartaMidnight(jakartaDate: Date): Date {
  const midnightJakarta = new Date(Date.UTC(jakartaDate.getUTCFullYear(), jakartaDate.getUTCMonth(), jakartaDate.getUTCDate()));
  return new Date(midnightJakarta.getTime() - JAKARTA_OFFSET_MINUTES * 60_000);
}

/** Brief section 36: organization-local (Asia/Jakarta) day/month boundaries, never raw UTC. */
export function resolveTimeGrain(grain: Exclude<TimeGrain, 'CUSTOM'>, now: Date = new Date()): DateRange {
  const today = toJakarta(now);
  switch (grain) {
    case 'TODAY': {
      const start = fromJakartaMidnight(today);
      return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
    }
    case 'YESTERDAY': {
      const startToday = fromJakartaMidnight(today);
      const start = new Date(startToday.getTime() - 24 * 60 * 60_000);
      return { start, end: startToday };
    }
    case 'LAST_7_DAYS': {
      const startToday = fromJakartaMidnight(today);
      return { start: new Date(startToday.getTime() - 7 * 24 * 60 * 60_000), end: new Date(startToday.getTime() + 24 * 60 * 60_000) };
    }
    case 'THIS_MONTH': {
      const monthStartJakarta = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const start = fromJakartaMidnight(monthStartJakarta);
      const nextMonthJakarta = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
      const end = fromJakartaMidnight(nextMonthJakarta);
      return { start, end };
    }
    case 'LAST_MONTH': {
      const thisMonthStartJakarta = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const lastMonthStartJakarta = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return { start: fromJakartaMidnight(lastMonthStartJakarta), end: fromJakartaMidnight(thisMonthStartJakarta) };
    }
  }
}

/** The immediately preceding period of equal length — used for "vs previous period" comparisons. */
export function previousPeriod(range: DateRange): DateRange {
  const durationMs = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - durationMs), end: range.start };
}

export interface PeriodComparison {
  current: number;
  previous: number;
  /** null when the previous value is 0 — a percentage change is undefined, never reported as -100%/Infinity (brief section 37/101). */
  percentChange: number | null;
  smallSample: boolean;
}

const SMALL_SAMPLE_THRESHOLD = 10;

/** Brief section 79: flags small samples so a swing like "3 vs 2" is never overstated as a percentage. */
export function comparePeriods(current: number, previous: number): PeriodComparison {
  const percentChange = previous === 0 ? null : ((current - previous) / previous) * 100;
  const smallSample = current < SMALL_SAMPLE_THRESHOLD && previous < SMALL_SAMPLE_THRESHOLD;
  return { current, previous, percentChange, smallSample };
}
