import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHandoffContext } from './handoffContext.ts';

function setEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.USE_MOCK_ZOHO = 'true';
}
function clearEnv() { delete process.env.USE_MOCK_ZOHO; }

test('Test 67 — a handoff context carries already-known product/quantity so Sales never re-asks the customer', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('commercial_drafts')) {
      return new Response(JSON.stringify([{ id: 'd1', type: 'SALES_ORDER', status: 'READY_FOR_REVIEW', pending_product_name: 'ATP 11358M', pending_item_code: 'ATP11358M', pending_quantity: 500, pending_unit: 'lembar', total: 1_450_000_000, currency: 'IDR' }]), { status: 200 });
    }
    if (u.includes('wati_messages')) return new Response(JSON.stringify([{ text: 'Bisa nego harga untuk 500 lembar?', received_at: '2026-01-01T00:00:00Z' }]), { status: 200 });
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  try {
    const context = await buildHandoffContext({
      reason: 'SPECIAL_PRICING', normalizedPhone: '234567890', conversationId: '234567890',
      activeCustomerId: 'CUST-001', currentIntent: 'DISCOUNT_REQUEST', waitingState: 'WAITING_INTERNAL',
    });
    assert.match(context.whatHasAlreadyBeenChecked.join(' '), /ATP11358M/);
    assert.match(context.whatHasAlreadyBeenChecked.join(' '), /500 lembar/);
    assert.equal(context.customerLastMessage, 'Bisa nego harga untuk 500 lembar?');
    assert.match(context.recommendedNextAction, /internal review/i);
  } finally {
    globalThis.fetch = originalFetch;
    clearEnv();
  }
});
