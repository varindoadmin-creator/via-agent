// ─── Rule-based anomaly detection ────────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 80-82: simple, configurable
// threshold checks — no ML. Reuses the existing email-alert channel
// (lib/email/sendMail.ts), never a new notification system.

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export interface Anomaly {
  type: 'SLA_BREACH_RATE_HIGH' | 'VENDOR_RESPONSE_TIME_HIGH';
  message: string;
  value: number;
  threshold: number;
}

export function detectSlaBreachAnomaly(currentBreachRate: number | null, caseCount: number): Anomaly | null {
  const threshold = envNumber('ANOMALY_SLA_BREACH_RATE_THRESHOLD', 0.25);
  const minSample = envNumber('ANOMALY_MIN_SAMPLE_SIZE', 10);
  if (currentBreachRate === null || caseCount < minSample) return null;
  if (currentBreachRate <= threshold) return null;
  return { type: 'SLA_BREACH_RATE_HIGH', message: `SLA breach rate is ${(currentBreachRate * 100).toFixed(0)}%, above the configured ${(threshold * 100).toFixed(0)}% threshold.`, value: currentBreachRate, threshold };
}

export function detectVendorResponseTimeAnomaly(vendor: string, medianResponseMinutes: number, inquiryCount: number): Anomaly | null {
  const threshold = envNumber('ANOMALY_VENDOR_RESPONSE_MINUTES_THRESHOLD', 120);
  const minSample = envNumber('ANOMALY_MIN_SAMPLE_SIZE', 10);
  if (inquiryCount < minSample) return null;
  if (medianResponseMinutes <= threshold) return null;
  return { type: 'VENDOR_RESPONSE_TIME_HIGH', message: `${vendor}'s median stock response time is ${Math.round(medianResponseMinutes)} minutes, above the configured ${threshold}-minute threshold.`, value: medianResponseMinutes, threshold };
}
