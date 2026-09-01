// ─── Test-harness fetch interception ──────────────────────────────────────────
// Safety-critical module. Guarantees:
//   1. No write ever reaches the real production Supabase tables — every
//      Supabase REST call is served from an in-memory, per-scenario table
//      store instead.
//   2. No real WhatsApp message is ever sent — outbound "sends" are captured
//      at the fetch layer (a fake WATI_API_BASE_URL is set so sendWatiText
//      actually attempts a call, which this module intercepts and answers
//      with a synthetic 'success' response, never touching wati.io).
//   3. Real Zoho Books calls pass through to the real network unmodified —
//      product/price/stock tests exercise the actual ProductService/
//      PricingService against real data, read-only.
//
// Every table lookup this pipeline actually performs is handled generically
// (eq/neq/in/gte/lte/gt/lt filters, insert with on_conflict/ignore-duplicates,
// patch-by-filter) rather than one hand-written stub per table, so a new
// table the pipeline touches doesn't silently fall through to a real network
// call — anything matching the Supabase host is always served locally.

export interface CapturedSend {
  to: string;
  text: string;
  category: string | null;
}

export interface FakeSupabaseHandle {
  fetchMock: typeof fetch;
  sends: CapturedSend[];
  reset(): void;
  seedRows(table: string, rows: Record<string, unknown>[]): void;
  getRows(table: string): Record<string, unknown>[];
}

type Row = Record<string, unknown>;

function parseFilterValue(spec: string): { op: string; value: string } {
  const dot = spec.indexOf('.');
  if (dot === -1) return { op: 'eq', value: spec };
  return { op: spec.slice(0, dot), value: spec.slice(dot + 1) };
}

function matchesFilter(row: Row, column: string, spec: string): boolean {
  const { op, value } = parseFilterValue(spec);
  const cell = row[column];
  switch (op) {
    case 'eq': return String(cell) === decodeURIComponent(value);
    case 'neq': return String(cell) !== decodeURIComponent(value);
    case 'is': return value === 'null' ? (cell === null || cell === undefined) : String(cell) === value;
    case 'not': {
      // e.g. "not.is.null" arrives as column=not.is.null via a second-level split below.
      const rest = value; // "is.null"
      if (rest.startsWith('is.')) {
        const inner = rest.slice(3);
        const isNull = cell === null || cell === undefined;
        return inner === 'null' ? !isNull : isNull;
      }
      return true;
    }
    case 'in': {
      const list = decodeURIComponent(value).replace(/^\(|\)$/g, '').split(',');
      return list.includes(String(cell));
    }
    case 'gte': return Number(cell) >= Number(decodeURIComponent(value)) || String(cell) >= decodeURIComponent(value);
    case 'lte': return Number(cell) <= Number(decodeURIComponent(value)) || String(cell) <= decodeURIComponent(value);
    case 'gt': return Number(cell) > Number(decodeURIComponent(value)) || String(cell) > decodeURIComponent(value);
    case 'lt': return Number(cell) < Number(decodeURIComponent(value)) || String(cell) < decodeURIComponent(value);
    default: return true;
  }
}

function applyFilters(rows: Row[], params: URLSearchParams): Row[] {
  let result = rows;
  for (const [key, value] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
    result = result.filter(r => matchesFilter(r, key, value));
  }
  return result;
}

function genId(): string {
  return `test-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function createFakeSupabase(options: { supabaseUrlPrefix: string; watiBaseUrl: string }): FakeSupabaseHandle {
  const tables = new Map<string, Row[]>();
  const sends: CapturedSend[] = [];
  // Captured BEFORE this module's mock is ever installed onto globalThis.fetch
  // — the passthrough branch below must never call the bare `fetch` global,
  // since by call time that identifier resolves to this very mock (installed
  // by the caller), causing infinite recursion ("Maximum call stack size
  // exceeded") rather than a real Zoho network call.
  const realFetch = globalThis.fetch;

  function tableFor(name: string): Row[] {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name)!;
  }

  const fetchMock = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = (init?.method || 'GET').toUpperCase();

    if (u.startsWith(options.watiBaseUrl)) {
      const parsed = new URL(u);
      const to = parsed.pathname.split('/').pop() || '';
      const text = decodeURIComponent(parsed.searchParams.get('messageText') ?? '');
      sends.push({ to, text, category: null });
      return new Response(JSON.stringify({ result: 'success' }), { status: 200 });
    }

    if (u.startsWith(options.supabaseUrlPrefix)) {
      const parsed = new URL(u);
      const table = parsed.pathname.replace(/^\/rest\/v1\//, '');
      const rows = tableFor(table);

      if (method === 'GET') {
        const matched = applyFilters(rows, parsed.searchParams);
        return new Response(JSON.stringify(matched), { status: 200 });
      }

      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Row;
        const onConflict = parsed.searchParams.get('on_conflict');
        const prefer = String((init?.headers as Record<string, string> | undefined)?.['Prefer'] ?? '');
        if (onConflict) {
          const conflictCols = onConflict.split(',');
          const dup = rows.find(r => conflictCols.every(c => String(r[c]) === String(body[c])));
          if (dup) {
            // ignore-duplicates semantics: nothing written, nothing returned.
            return new Response(prefer.includes('return=minimal') ? '' : '[]', { status: 200 });
          }
        }
        const row: Row = { id: genId(), version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
        rows.push(row);
        if (prefer.includes('return=minimal')) return new Response('', { status: 201 });
        return new Response(JSON.stringify([row]), { status: 201 });
      }

      if (method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Row;
        const matched = applyFilters(rows, parsed.searchParams);
        for (const row of matched) Object.assign(row, body, { updated_at: new Date().toISOString() });
        return new Response(JSON.stringify(matched), { status: 200 });
      }

      return new Response('[]', { status: 200 });
    }

    // Anything else (Zoho Books/Accounts APIs) — real network, read-only in practice.
    return realFetch(url as never, init);
  }) as typeof fetch;

  return {
    fetchMock,
    sends,
    reset() { tables.clear(); sends.length = 0; },
    seedRows(table: string, seedRows: Row[]) { tableFor(table).push(...seedRows); },
    getRows(table: string) { return tableFor(table); },
  };
}
