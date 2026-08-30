import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutboundText, sendWatiTextGated } from './disclosureGate.ts';

test('flags a sensitive keyword co-occurring with a figure — something no legitimate template should ever produce', () => {
  assert.equal(checkOutboundText('Margin kami Rp 500.000 untuk produk ini.').safe, false);
  assert.equal(checkOutboundText('Harga beli supplier 1200000.').safe, false);
});

test('Phase 2/3 real templates all pass the gate cleanly', () => {
  assert.equal(checkOutboundText('Baik Pak/Bu, untuk kebutuhan 20 lembar saat ini tersedia.').safe, true);
  assert.equal(checkOutboundText('Mohon maaf Pak/Bu, informasi penjualan internal Varindo tidak dapat kami bagikan. Namun kami dapat membantu terkait produk, stok, harga, atau pesanan Bapak/Ibu.').safe, true);
  assert.equal(checkOutboundText('Halo, selamat datang di Varindo. Terima kasih telah menghubungi kami. Ada yang dapat kami bantu?').safe, true);
});

test('a customer\'s own requested quantity echoed back does not trip the gate (no sensitive keyword present)', () => {
  assert.equal(checkOutboundText('Baik Pak/Bu, untuk kebutuhan 75 lembar saat ini tersedia.').safe, true);
});

test('sendWatiTextGated blocks and never calls through when the text is unsafe', async () => {
  const originalToken = process.env.WATI_API_TOKEN;
  delete process.env.WATI_API_TOKEN; // ensure sendWatiText itself would just no-op even if reached
  try {
    const result = await sendWatiTextGated('628123', 'Margin kami Rp 500.000.', { conversationId: 'c1', category: 'TEST' });
    assert.equal(result, 'blocked');
  } finally {
    if (originalToken !== undefined) process.env.WATI_API_TOKEN = originalToken;
  }
});

test('sendWatiTextGated passes safe text through to the underlying client', async () => {
  const originalToken = process.env.WATI_API_TOKEN;
  const originalBaseUrl = process.env.WATI_API_BASE_URL;
  delete process.env.WATI_API_TOKEN;
  delete process.env.WATI_API_BASE_URL;
  try {
    const result = await sendWatiTextGated('628123', 'Baik Pak/Bu, untuk barang tersebut saat ini tersedia.', { conversationId: 'c1', category: 'TEST' });
    // No WATI credentials configured — the underlying client itself no-ops,
    // proving this call reached it rather than being blocked.
    assert.equal(result, 'disabled');
  } finally {
    if (originalToken !== undefined) process.env.WATI_API_TOKEN = originalToken;
    if (originalBaseUrl !== undefined) process.env.WATI_API_BASE_URL = originalBaseUrl;
  }
});
