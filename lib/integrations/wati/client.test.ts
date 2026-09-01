import assert from 'node:assert/strict';
import test from 'node:test';
import { sendWatiText } from './client.ts';

function setEnv() {
  process.env.WATI_API_TOKEN = 'test-token';
  process.env.WATI_API_BASE_URL = 'https://live-mt-server.wati.io/test-tenant';
}

/**
 * 2026-09-01 production incident: a customer-facing reply silently failed
 * (WATI's own Team Inbox showed a red error mark on the message) while VIA
 * logged and reported "sent" — the old client only checked HTTP status
 * (`response.ok`), never the response body. WATI's real API returns HTTP 200
 * even for a failed send: `{"ok": false, "result": "success",
 * "message": {"status": 0, "statusString": "FAILED", "failedDetail": "..."}}`
 * — this is the exact body captured from that incident's diagnostic call.
 */
test('Test — a WATI response with HTTP 200 but a failed-send body is reported as failed, not sent', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    result: 'success',
    message: {
      whatsappMessageId: null, status: 0, statusString: 'FAILED',
      failedDetail: 'An unknown error has occurred.', failedCode: null,
    },
  }), { status: 200 })) as typeof fetch;
  try {
    const result = await sendWatiText('628161345224', 'Halo, selamat datang di Varindo.');
    assert.equal(result, 'failed');
  } finally {
    globalThis.fetch = original;
  }
});

test('Test — a genuine WATI success (HTTP 200, ok: true, no FAILED status) is reported as sent', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    result: 'success',
    message: { whatsappMessageId: 'gBGHhhOEIBRwbwIJmv6AGHQ-L22Y', status: 1, statusString: null },
  }), { status: 200 })) as typeof fetch;
  try {
    const result = await sendWatiText('628161345224', 'Halo, selamat datang di Varindo.');
    assert.equal(result, 'sent');
  } finally {
    globalThis.fetch = original;
  }
});

test('a non-2xx HTTP response is still reported as failed (unchanged behavior)', async () => {
  setEnv();
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('Internal Server Error', { status: 500 })) as typeof fetch;
  try {
    const result = await sendWatiText('628161345224', 'Halo');
    assert.equal(result, 'failed');
  } finally {
    globalThis.fetch = original;
  }
});

test('missing WATI credentials returns "disabled" without attempting a send', async () => {
  delete process.env.WATI_API_TOKEN;
  delete process.env.WATI_API_BASE_URL;
  const result = await sendWatiText('628161345224', 'Halo');
  assert.equal(result, 'disabled');
});
