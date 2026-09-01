// ─── WATI webhook load test (dev tool, not CI-gated) ──────────────────────────
// VIA Phase 13, brief section 62: fires N concurrent synthetic WATI webhook
// payloads at a locally-running `npm run dev` server and reports latency
// percentiles + error rate. Never run against a shared/production URL —
// this sends real (if synthetic-content) traffic through the real inbound
// pipeline. See docs/evaluation-release-gates.md for VIA's actual traffic
// scale assumption.
//
// Usage:
//   npm run dev  (in one terminal)
//   node --experimental-strip-types scripts/load-test-webhook.ts --concurrency=10 --total=100 [--url=http://localhost:3000/api/integrations/wati/webhook]

const args = process.argv.slice(2);
const valueFor = (name: string, fallback: string) => args.find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;

const url = valueFor('--url', 'http://localhost:3000/api/integrations/wati/webhook');
const concurrency = Math.max(1, Number(valueFor('--concurrency', '10')));
const total = Math.max(1, Number(valueFor('--total', '100')));

function syntheticPayload(index: number): Record<string, unknown> {
  return {
    eventType: 'message',
    id: `load-test-${Date.now()}-${index}`,
    waId: `62800000${String(index).padStart(4, '0')}`,
    text: 'Berapa harga ATP11358M?',
    type: 'text',
    owner: false,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

async function sendOne(index: number): Promise<{ latencyMs: number; status: number; ok: boolean }> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syntheticPayload(index)),
    });
    return { latencyMs: Date.now() - startedAt, status: response.status, ok: response.ok };
  } catch {
    return { latencyMs: Date.now() - startedAt, status: 0, ok: false };
  }
}

async function main() {
  console.log(`Load-testing ${url} — ${total} requests at concurrency ${concurrency}.`);
  const results: Array<{ latencyMs: number; status: number; ok: boolean }> = [];
  let next = 0;
  async function worker() {
    while (next < total) {
      const i = next++;
      results.push(await sendOne(i));
    }
  }
  const startedAt = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  const totalMs = Date.now() - startedAt;

  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const errors = results.filter(r => !r.ok).length;

  console.log(JSON.stringify({
    totalRequests: results.length,
    totalDurationMs: totalMs,
    requestsPerSecond: Number((results.length / (totalMs / 1000)).toFixed(2)),
    errorRate: Number((errors / results.length).toFixed(4)),
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), max: latencies[latencies.length - 1] },
  }, null, 2));
}

await main();
export {};
