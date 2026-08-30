// ─── SLA tracking ─────────────────────────────────────────────────────────────
// Brief section 23: configurable thresholds, not hardcoded permanent policy.

export type SlaStatus = 'ON_TIME' | 'WARNING' | 'BREACHED';

function envMinutes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function slaWarningMinutes(): number {
  return envMinutes('STOCK_SLA_WARNING_MINUTES', 30);
}

export function slaBreachMinutes(): number {
  return envMinutes('STOCK_SLA_BREACH_MINUTES', 120);
}

export function computeSlaStatus(createdAt: Date, now: Date = new Date()): SlaStatus {
  const ageMinutes = (now.getTime() - createdAt.getTime()) / 60_000;
  if (ageMinutes >= slaBreachMinutes()) return 'BREACHED';
  if (ageMinutes >= slaWarningMinutes()) return 'WARNING';
  return 'ON_TIME';
}
