// ─── WATI outbound client ───────────────────────────────────────────────────────
// Central place for all WATI send calls (brief section 16) — never scatter WATI
// HTTP calls elsewhere. Inert until WATI_API_TOKEN/WATI_API_BASE_URL/WATI_TENANT_ID
// are configured (logs and no-ops), same pattern as JARVIS_FEEDBACK_SCHEMA_ENABLED
// gating elsewhere in this codebase — so the pipeline deploys safely even before
// real WATI send credentials exist. Endpoint shape follows WATI's documented
// sendSessionMessage API; verify against your account's real credentials/docs
// before relying on it in production (see docs/integrations/wati.md).

export type WatiSendResult = 'sent' | 'disabled' | 'failed';

function watiConfig() {
  const token = process.env.WATI_API_TOKEN;
  const baseUrl = process.env.WATI_API_BASE_URL; // e.g. https://live-mt-server.wati.io/<tenantId>
  if (!token || !baseUrl) return null;
  return { token, baseUrl: baseUrl.replace(/\/$/, '') };
}

/** Sends a plain session-message reply. Never throws — logs and returns a status instead. */
export async function sendWatiText(whatsappNumber: string, text: string): Promise<WatiSendResult> {
  const config = watiConfig();
  if (!config) {
    console.info('[wati.client]', JSON.stringify({ event: 'send_skipped_not_configured', to: whatsappNumber }));
    return 'disabled';
  }
  try {
    const url = `${config.baseUrl}/api/v1/sendSessionMessage/${encodeURIComponent(whatsappNumber)}?messageText=${encodeURIComponent(text)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) {
      console.error('[wati.client]', JSON.stringify({ event: 'send_failed', status: response.status }));
      return 'failed';
    }
    console.info('[wati.client]', JSON.stringify({ event: 'send_ok', to: whatsappNumber }));
    return 'sent';
  } catch (error) {
    console.error('[wati.client]', JSON.stringify({ event: 'send_error', error: error instanceof Error ? error.message : 'unknown' }));
    return 'failed';
  }
}
