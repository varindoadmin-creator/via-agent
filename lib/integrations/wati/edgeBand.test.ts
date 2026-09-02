import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEdgeBandForProduct } from './edgeBand.ts';
import { clearTokenCache } from '../../zoho/auth.ts';
import type { ZohoItem } from '../../../types/zoho.ts';

const LAMITAK_PANEL: ZohoItem = { item_id: 'p1', name: "DXO 5338D - LAMITAK HPL 4'x8' | STOFFA GRIGIO", sku: 'LAM-DXO5338D', rate: 700000, status: 'active' };
const EDL_PANEL: ZohoItem = { item_id: 'p2', name: "DWT 3773W - EDL HPL 4'x8' | BONDI BIRCH", sku: 'EDL-DWT3773W', rate: 788100, status: 'active' };

const SEARCH_HTML = `<a aria-label="DXO 5338D - LAMITAK HPL 4'x8' | STOFFA GRIGIO" class="block" href="/products/dxo-5338d-stoffa-grigio">`;
// Real observed shape: the trailing digits after the 2-digit width are unrelated page metadata Zoho doesn't recognize.
const LAMITAK_PRODUCT_HTML = `<dt>Newedge Code (23mm Width)</dt><dd class="x">EAP5338R0V2/2310/1</dd><dt>Newedge Code (44mm Width)</dt><dd class="x">EAP5338R0V2/4410/1</dd>`;
const EDL_SEARCH_HTML = `<a aria-label="DWT 3773W - EDL HPL 4'x8' | BONDI BIRCH" class="block" href="/products/dwt-3773w-bondi-birch">`;
const EDL_PRODUCT_HTML_ESCAPED = `{\\"edgebandCode\\":\\"EW 03773D\\",\\"edgebandSizes\\":[\\"23 x 1.0mm\\",\\"45 x 1.0mm\\"]}`;
const EDL_PRODUCT_HTML_PLAIN = `{"edgebandCode":"EW 03773D","edgebandSizes":["23 x 1.0mm","45 x 1.0mm"]}`;

function setZohoEnv() {
  process.env.ZOHO_CLIENT_ID = 'test-client';
  process.env.ZOHO_CLIENT_SECRET = 'test-secret';
  process.env.ZOHO_REFRESH_TOKEN = 'test-refresh';
  process.env.ZOHO_ORGANIZATION_ID = 'test-org';
  clearTokenCache();
}

/** Wraps a test's URL handler with a transparent Zoho OAuth responder, so every test only has to describe the site/Zoho-search URLs it actually cares about. */
function withZohoAuth(handler: (url: string) => Response) {
  return (async (url: string) => {
    const u = String(url);
    if (u.includes('/oauth/v2/token')) {
      return new Response(JSON.stringify({ access_token: 'fake-token', expires_in: 3600 }), { status: 200 });
    }
    return handler(u);
  }) as typeof fetch;
}

test('Lamitak: discovers both width codes from the website, strips trailing page metadata, verifies each against Zoho', async () => {
  setZohoEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = withZohoAuth((u) => {
    if (u.includes('varindo.co.id/products?search')) return new Response(SEARCH_HTML, { status: 200 });
    if (u.includes('varindo.co.id/products/dxo-5338d-stoffa-grigio')) return new Response(LAMITAK_PRODUCT_HTML, { status: 200 });
    if (u.includes('items?search_text')) {
      const q = new URL(u).searchParams.get('search_text') || '';
      if (q.includes('EAP5338R0V2/23') && !q.includes('44')) {
        return new Response(JSON.stringify({ items: [{ item_id: 'e23', name: "EAP 5338R0V2/23 - NEWEDGE ABS EDGING W23MM X T1.0MM | DXO 5338D", sku: 'LAM-EAP5338R0V2/23', rate: 20000, status: 'active', unit: 'm' }] }), { status: 200 });
      }
      if (q.includes('EAP5338R0V2/44')) {
        return new Response(JSON.stringify({ items: [{ item_id: 'e44', name: "EAP 5338R0V2/44 - NEWEDGE ABS EDGING W44MM X T1.0MM | DXO 5338D", sku: 'LAM-EAP5338R0V2/44', rate: 35000, status: 'active', unit: 'm' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    return new Response('', { status: 404 });
  });
  try {
    const result = await resolveEdgeBandForProduct(LAMITAK_PANEL, 'LAMITAK');
    assert.equal(result.length, 2);
    assert.ok(result.some(r => r.sku === 'LAM-EAP5338R0V2/23'));
    assert.ok(result.some(r => r.sku === 'LAM-EAP5338R0V2/44'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('EDL: parses the escaped-JSON page shape and verifies against Zoho', async () => {
  setZohoEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = withZohoAuth((u) => {
    if (u.includes('varindohpl.com/products?search')) return new Response(EDL_SEARCH_HTML, { status: 200 });
    if (u.includes('varindohpl.com/products/dwt-3773w-bondi-birch')) return new Response(EDL_PRODUCT_HTML_ESCAPED, { status: 200 });
    if (u.includes('items?search_text')) {
      const q = new URL(u).searchParams.get('search_text') || '';
      if (q.includes('EW 03773D')) {
        return new Response(JSON.stringify({ items: [{ item_id: 'ew23', name: 'EW 03773D 23*1 - EDL ABS EDGING W23MM X T1.0MM', sku: 'EDL-EW03773D23*1', rate: 20000, status: 'active', unit: 'm' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    return new Response('', { status: 404 });
  });
  try {
    const result = await resolveEdgeBandForProduct(EDL_PANEL, 'EDL');
    assert.equal(result.length, 1);
    assert.equal(result[0].sku, 'EDL-EW03773D23*1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('EDL: also parses the plain (unescaped) JSON page shape', async () => {
  setZohoEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = withZohoAuth((u) => {
    if (u.includes('varindohpl.com/products?search')) return new Response(EDL_SEARCH_HTML, { status: 200 });
    if (u.includes('varindohpl.com/products/dwt-3773w-bondi-birch')) return new Response(EDL_PRODUCT_HTML_PLAIN, { status: 200 });
    if (u.includes('items?search_text')) {
      return new Response(JSON.stringify({ items: [{ item_id: 'ew23', name: 'EW 03773D 23*1 - EDL ABS EDGING W23MM X T1.0MM', sku: 'EDL-EW03773D23*1', rate: 20000, status: 'active', unit: 'm' }] }), { status: 200 });
    }
    return new Response('', { status: 404 });
  });
  try {
    const result = await resolveEdgeBandForProduct(EDL_PANEL, 'EDL');
    assert.equal(result.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('website unreachable: falls back to pure-Zoho name cross-reference (findEdgeBandVariants), never throws', async () => {
  setZohoEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = withZohoAuth((u) => {
    if (u.includes('varindo.co.id')) return new Response('', { status: 500 });
    if (u.includes('items?search_text')) {
      const q = new URL(u).searchParams.get('search_text') || '';
      if (q.includes('DXO 5338D') || q.includes('DXO5338D')) {
        return new Response(JSON.stringify({ items: [
          LAMITAK_PANEL,
          { item_id: 'e23', name: "EAP 5338R0V2/23 - NEWEDGE ABS EDGING W23MM X T1.0MM | DXO 5338D", sku: 'LAM-EAP5338R0V2/23', rate: 20000, status: 'active', unit: 'm' },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }
    return new Response('', { status: 404 });
  });
  try {
    const result = await resolveEdgeBandForProduct(LAMITAK_PANEL, 'LAMITAK');
    assert.equal(result.length, 1);
    assert.equal(result[0].sku, 'LAM-EAP5338R0V2/23');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('no edging exists anywhere (website and Zoho fallback both empty): returns an empty array, never guesses', async () => {
  setZohoEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = withZohoAuth(() => new Response(JSON.stringify({ items: [] }), { status: 200 }));
  try {
    const result = await resolveEdgeBandForProduct(LAMITAK_PANEL, 'LAMITAK');
    assert.deepEqual(result, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('brand unknown (null): skips the website entirely, goes straight to the Zoho fallback', async () => {
  setZohoEnv();
  const originalFetch = globalThis.fetch;
  let websiteCalled = false;
  globalThis.fetch = withZohoAuth((u) => {
    if (u.includes('varindo.co.id') || u.includes('varindohpl.com')) { websiteCalled = true; return new Response('', { status: 200 }); }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
  try {
    await resolveEdgeBandForProduct(LAMITAK_PANEL, null);
    assert.equal(websiteCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
