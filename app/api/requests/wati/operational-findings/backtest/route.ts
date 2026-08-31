import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { runOperationalDetection } from '@/lib/operationalIntelligence/detectionEngine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/requests/wati/operational-findings/backtest — brief sections
// 118-120: runs every detection rule against current data WITHOUT writing
// any finding or sending mail, so thresholds can be validated before
// OPERATIONAL_DETECTION_ENABLED is turned on in production.
export async function POST(req: NextRequest) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await runOperationalDetection({ dryRun: true, notify: false, includeDailyRules: true });
    const bySeverityMagnitude = [...result.candidates].sort((a, b) => b.magnitude - a.magnitude);
    return NextResponse.json({
      success: true,
      candidatesEvaluated: result.candidatesEvaluated,
      byType: bySeverityMagnitude.map(c => ({ type: c.type, category: c.category, magnitude: c.magnitude, confidence: c.confidence, sampleSize: c.sampleSize, title: c.title })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Backtest failed.' }, { status: 500 });
  }
}
