// ─── Outcome tracking ──────────────────────────────────────────────────────────
// VIA Customer Operations Phase 10, brief section 92: before/after values
// once a finding resolves, explicitly labeled "post-action change" — never a
// causal claim (the brief's own instruction: "do not claim causal impact
// unless evidence supports it").

import { getFinding } from './findingStore.ts';

export interface FindingOutcome {
  findingId: string;
  metricKey: string | null;
  beforeValue: number | null;
  afterValue: number | null;
  label: 'post-action change';
}

export async function getFindingOutcome(findingId: string): Promise<FindingOutcome | null> {
  const finding = await getFinding(findingId);
  if (!finding || finding.status !== 'RESOLVED') return null;
  return {
    findingId: finding.id,
    metricKey: finding.metricKey,
    beforeValue: finding.currentValue,
    afterValue: finding.resolvedValue,
    label: 'post-action change',
  };
}
