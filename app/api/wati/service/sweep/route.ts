import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cron/runLog';
import { sendMail } from '@/lib/email/sendMail';
import { supabaseSelect } from '@/lib/supabase/rest';
import { computeCaseSlaStatus } from '@/lib/customerService/sla';
import { recordServiceEvent } from '@/lib/customerService/auditLog';
import { isCustomerServiceSlaEnabled, isSlaEscalationEnabled } from '@/lib/customerIdentity/featureFlags';

export const maxDuration = 120;

const ALERT_TO = process.env.VIA_ALERT_EMAIL || 'varindo.admin@gmail.com';

interface OpenCaseRow {
  customer_phone_normalized: string;
  handoff_reason: string | null;
  handoff_created_at: string | null;
  assigned_team: string | null;
  priority: string;
}

/**
 * Triggered periodically by an external cron-job.org scheduled job (see
 * middleware.ts CRON_PATHS), same pattern as app/api/wati/stock/sweep —
 * computes SLA status for every open human-owned case and sends one bounded
 * summary email for warnings/breaches, never per-case spam (brief section
 * 18/44).
 */
export async function POST() {
  const startedAt = new Date().toISOString();
  if (!isCustomerServiceSlaEnabled()) {
    await recordCronRun('wati-service-sweep', 'success', startedAt, { skipped: 'CUSTOMER_SERVICE_SLA_ENABLED is off' });
    return NextResponse.json({ success: true, skipped: true });
  }

  try {
    const openCases = await supabaseSelect<OpenCaseRow>(
      'wati_conversation_state',
      'state=in.(NEEDS_HUMAN,HUMAN_ASSIGNED)&handoff_created_at=not.is.null&select=customer_phone_normalized,handoff_reason,handoff_created_at,assigned_team,priority',
    );

    const warnings: OpenCaseRow[] = [];
    const breaches: OpenCaseRow[] = [];
    for (const c of openCases) {
      if (!c.handoff_created_at) continue;
      const status = computeCaseSlaStatus(new Date(c.handoff_created_at));
      if (status === 'WARNING') warnings.push(c);
      if (status === 'BREACHED') {
        breaches.push(c);
        // Bounded escalation (brief section 18): one audit event per sweep per case, not per minute.
        if (isSlaEscalationEnabled()) {
          await recordServiceEvent({ normalizedPhone: c.customer_phone_normalized, eventType: 'service.sla_breached', actor: 'SYSTEM', toValue: c.assigned_team ?? undefined });
        }
      } else if (status === 'WARNING') {
        await recordServiceEvent({ normalizedPhone: c.customer_phone_normalized, eventType: 'service.sla_warning', actor: 'SYSTEM', toValue: c.assigned_team ?? undefined });
      }
    }

    let emailed = false;
    if (breaches.length > 0 || warnings.length > 0) {
      const row = (c: OpenCaseRow, label: string) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${label}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${c.customer_phone_normalized}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${c.handoff_reason || '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e5e5">${c.assigned_team || 'Unassigned'}</td>
        </tr>`;
      const rows = [...breaches.map(c => row(c, 'BREACHED')), ...warnings.map(c => row(c, 'WARNING'))].join('');
      const html = `<p>${breaches.length} SLA breach${breaches.length === 1 ? '' : 'es'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'} in the Customer Service queue:</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px">
          <thead><tr style="background:#f5f5f5;text-align:left;font-size:12px;text-transform:uppercase;color:#666">
            <th style="padding:6px 10px">Status</th><th style="padding:6px 10px">Phone</th><th style="padding:6px 10px">Reason</th><th style="padding:6px 10px">Team</th>
          </tr></thead><tbody>${rows}</tbody></table>
        <p style="margin-top:16px"><a href="https://via-601025884976.asia-southeast2.run.app/requests/wati/customer-service">Open Customer Service in VIA →</a></p>`;
      await sendMail({ to: ALERT_TO, subject: `VIA Alert: ${breaches.length} SLA breach${breaches.length === 1 ? '' : 'es'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`, html });
      emailed = true;
    }

    await recordCronRun('wati-service-sweep', 'success', startedAt, { open: openCases.length, warnings: warnings.length, breached: breaches.length, emailed });
    return NextResponse.json({ success: true, open: openCases.length, warnings: warnings.length, breached: breaches.length, emailed });
  } catch (err) {
    await recordCronRun('wati-service-sweep', 'failed', startedAt, {}, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
