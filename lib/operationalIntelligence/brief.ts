// ─── Jarvis proactive brief ────────────────────────────────────────────────────
// VIA Customer Operations Phase 10, brief sections 58-59: "Today's Operational
// Brief" — top 3-5 actionable findings only, never a flood of every open
// issue. The single function backing both the Jarvis tool and the dashboard
// widget (brief section 142), so the two can never disagree.

import { rankOpenFindings } from './priorityService.ts';
import type { OperationalFinding } from './types.ts';

const MAX_BRIEF_ITEMS = 5;

export interface OperationalBrief {
  generatedAt: string;
  topFindings: OperationalFinding[];
  topOpportunity: OperationalFinding | null;
  totalOpenCount: number;
}

export async function getOperationalBrief(): Promise<OperationalBrief> {
  const ranked = await rankOpenFindings();
  const nonOpportunity = ranked.filter(r => r.finding.category !== 'COMMERCIAL_OPPORTUNITY');
  const opportunities = ranked.filter(r => r.finding.category === 'COMMERCIAL_OPPORTUNITY' || r.finding.type === 'HIGH_DEMAND_LOW_AVAILABILITY');

  return {
    generatedAt: new Date().toISOString(),
    topFindings: nonOpportunity.slice(0, MAX_BRIEF_ITEMS).map(r => r.finding),
    topOpportunity: opportunities[0]?.finding ?? null,
    totalOpenCount: ranked.length,
  };
}
