// ─── Cohort analysis ────────────────────────────────────────────────────────────
// VIA Phase 12, brief section 29: group customers by their first-activity
// month, track whether each cohort is still active N months later. Purely
// deterministic — no I/O; callers supply each customer's activity months
// (from invoices, quotations, or sample requests, per the caller's choice
// of cohort definition).

export interface CustomerActivityRecord {
  customerId: string;
  /** 'YYYY-MM' months in which this customer had the activity being cohorted (e.g. an issued invoice, a quotation, a sample request). */
  activityMonths: string[];
}

export interface CohortRetentionRow {
  cohortMonth: string;
  cohortSize: number;
  /** Index 0 = the cohort month itself (always 1.0 by construction). null = offset not yet observable (in the future relative to asOfMonth). */
  retentionByMonthOffset: (number | null)[];
}

function addMonths(yyyyMm: string, offset: number): string {
  const [year, month] = yyyyMm.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildCohortRetentionTable(records: CustomerActivityRecord[], maxOffset: number, asOfMonth: string): CohortRetentionRow[] {
  const cohorts = new Map<string, CustomerActivityRecord[]>();
  for (const record of records) {
    if (record.activityMonths.length === 0) continue;
    const cohortMonth = [...record.activityMonths].sort()[0];
    const bucket = cohorts.get(cohortMonth) ?? [];
    bucket.push(record);
    cohorts.set(cohortMonth, bucket);
  }

  return [...cohorts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohortMonth, members]) => {
    const retentionByMonthOffset = Array.from({ length: maxOffset + 1 }, (_, offset) => {
      const targetMonth = addMonths(cohortMonth, offset);
      if (targetMonth > asOfMonth) return null;
      const activeCount = members.filter(m => m.activityMonths.includes(targetMonth)).length;
      return activeCount / members.length;
    });
    return { cohortMonth, cohortSize: members.length, retentionByMonthOffset };
  });
}
