import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProductImage } from './imageAnalysis.ts';

function setEnv() {
  process.env.WATI_API_TOKEN = 'test-token';
  process.env.WATI_API_BASE_URL = 'https://example.wati.io/tenant';
  process.env.AI_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'test-key';
}

function cleanupEnv() {
  delete process.env.WATI_API_TOKEN;
  delete process.env.WATI_API_BASE_URL;
  delete process.env.AI_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
}

test('no WATI_API_TOKEN: never attempts a fetch, fails safe to null', async () => {
  cleanupEnv();
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => { fetchCalled = true; return new Response('', { status: 200 }); }) as typeof fetch;
  try {
    const result = await analyzeProductImage('https://live-mt-server.wati.io/tenant/api/file/showFile?fileName=x.jpg');
    assert.deepEqual(result, { codeCandidate: null });
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('image download fails (non-200): fails safe to null, never throws', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('not found', { status: 404 })) as typeof fetch;
  try {
    const result = await analyzeProductImage('https://live-mt-server.wati.io/tenant/api/file/showFile?fileName=x.jpg');
    assert.deepEqual(result, { codeCandidate: null });
  } finally {
    globalThis.fetch = originalFetch;
    cleanupEnv();
  }
});

test('image too large (content-length over 5MB): fails safe to null, never calls the model', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let modelCalled = false;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) { modelCalled = true; return new Response('{}', { status: 200 }); }
    return new Response(new Uint8Array(10), { status: 200, headers: { 'content-length': String(10 * 1024 * 1024) } });
  }) as typeof fetch;
  try {
    const result = await analyzeProductImage('https://live-mt-server.wati.io/tenant/api/file/showFile?fileName=x.jpg');
    assert.deepEqual(result, { codeCandidate: null });
    assert.equal(modelCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    cleanupEnv();
  }
});

test('a clean model response extracts the code candidate', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  let sentImageBlock: { type: string; source?: { media_type?: string } } | undefined;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) {
      const body = JSON.parse(String(init!.body));
      sentImageBlock = body.messages[0].content.find((b: { type: string }) => b.type === 'image');
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"codeCandidate": "ATP 1382 M"}' }], model: 'claude-test' }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }) as typeof fetch;
  try {
    const result = await analyzeProductImage('https://live-mt-server.wati.io/tenant/api/file/showFile?fileName=x.jpg');
    assert.deepEqual(result, { codeCandidate: 'ATP 1382 M' });
    assert.equal(sentImageBlock?.type, 'image');
    assert.equal(sentImageBlock?.source?.media_type, 'image/jpeg');
  } finally {
    globalThis.fetch = originalFetch;
    cleanupEnv();
  }
});

test('model returns null codeCandidate (e.g. unrelated photo): passes through as null, never invented', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"codeCandidate": null}' }], model: 'claude-test' }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }) as typeof fetch;
  try {
    const result = await analyzeProductImage('https://live-mt-server.wati.io/tenant/api/file/showFile?fileName=x.jpg');
    assert.deepEqual(result, { codeCandidate: null });
  } finally {
    globalThis.fetch = originalFetch;
    cleanupEnv();
  }
});

test('malformed model output (not JSON): fails safe to null, never throws', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'not json at all' }], model: 'claude-test' }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }) as typeof fetch;
  try {
    const result = await analyzeProductImage('https://live-mt-server.wati.io/tenant/api/file/showFile?fileName=x.jpg');
    assert.deepEqual(result, { codeCandidate: null });
  } finally {
    globalThis.fetch = originalFetch;
    cleanupEnv();
  }
});

test('an oversized/garbage codeCandidate string is truncated, not passed through unbounded', async () => {
  setEnv();
  const originalFetch = globalThis.fetch;
  const longCode = 'A'.repeat(500);
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ codeCandidate: longCode }) }], model: 'claude-test' }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  }) as typeof fetch;
  try {
    const result = await analyzeProductImage('https://live-mt-server.wati.io/tenant/api/file/showFile?fileName=x.jpg');
    assert.ok(result.codeCandidate && result.codeCandidate.length <= 40);
  } finally {
    globalThis.fetch = originalFetch;
    cleanupEnv();
  }
});
