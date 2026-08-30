import assert from 'node:assert/strict';
import test from 'node:test';
import { isWebsiteGeneratedMessage, parseWebsiteStructuredProduct } from './websiteParser.ts';

const STRUCTURED_MESSAGE = `Halo Admin Varindo, saya tertarik dengan produk berikut:

Produk: ATP 11358M - LAMITAK HPL 4'x10' | MARMO CLASSICO PRO
Kode: ATP 11358M
Harga: Rp. 2.886.000 (Termasuk PPN)

Terima kasih.`;

test('Structured website product: extracts code, price, and tax-inclusive flag', () => {
  assert.equal(isWebsiteGeneratedMessage(STRUCTURED_MESSAGE), true);
  const parsed = parseWebsiteStructuredProduct(STRUCTURED_MESSAGE);
  assert.equal(parsed?.productCode, 'ATP 11358M');
  assert.equal(parsed?.displayedPrice, 2886000);
  assert.equal(parsed?.displayedPriceIncludesTax, true);
  assert.match(parsed?.productName ?? '', /MARMO CLASSICO PRO/);
});

test('Generic website prefix without a structured block: recognized as website-generated but no product parsed', () => {
  const text = 'Halo Admin Varindo, saya ingin bertanya tentang produk Lamitak.';
  assert.equal(isWebsiteGeneratedMessage(text), true);
  assert.equal(parseWebsiteStructuredProduct(text), null);
});

test('Never guesses a product from an unrelated message', () => {
  assert.equal(parseWebsiteStructuredProduct('Halo, apa kabar?'), null);
  assert.equal(isWebsiteGeneratedMessage('Halo, apa kabar?'), false);
});
