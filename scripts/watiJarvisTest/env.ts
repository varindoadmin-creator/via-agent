// Loads .env.local the same way Next.js does for a standalone `node` script
// run outside the Next.js process. Real Zoho/Supabase credentials are
// intentionally loaded so product/price/stock tests exercise the actual
// ProductService/PricingService — never a second, hand-maintained fixture
// set that could drift from real Zoho data. Supabase is separately faked at
// the fetch layer (see fakeSupabase.ts) so no test run writes to the real
// production tables, regardless of these credentials being present.
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';

export function loadEnvLocal(): void {
  if (!existsSync('.env.local')) return;
  const text = readFileSync('.env.local', 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
