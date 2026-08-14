import { findViaFeatures } from './featureRegistry.ts';

export type LiveQuestion =
  | { kind: 'feature'; query: string }
  | { kind: 'brand_sales'; month: string; brandHint: string }
  | { kind: 'shipments_out'; todayOnly: boolean }
  | { kind: 'purchase_gap' };

function jakartaMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}

export function detectLiveQuestion(message: string): LiveQuestion | null {
  const text = message.trim();
  const lower = text.toLowerCase();
  if (/\b(where|which (?:menu|page)|how (?:do|can) i find|di mana|menu apa|fitur apa)\b/.test(lower)) {
    return { kind: 'feature', query: text };
  }
  const brandSales = lower.match(/(?:sales|revenue|penjualan)(?:\s+(?:of|for|brand))?\s+([a-z0-9 -]+?)(?:\s+(?:this|current)\s+month|\s+bulan\s+ini|\?|$)/i);
  if (brandSales && /(?:this|current) month|bulan ini/i.test(lower)) {
    return { kind: 'brand_sales', month: jakartaMonth(), brandHint: brandSales[1].trim() };
  }
  if (/(?:shipment|delivery|pengiriman).*(?:out for delivery|dikirim|in transit)|(?:out for delivery).*(?:shipment|today|hari ini)/i.test(lower)) {
    return { kind: 'shipments_out', todayOnly: /today|hari ini/i.test(lower) };
  }
  if (/(?:sales order|so).*(?:not (?:been )?ordered|without (?:a )?(?:po|purchase order)|belum dipesan|belum dibuatkan po)|(?:purchase gap|po coverage)/i.test(lower)) {
    return { kind: 'purchase_gap' };
  }
  return null;
}

export function answerFeatureQuestion(query: string): string | null {
  const matches = findViaFeatures(query);
  if (!matches.length) return null;
  return ['You can find this in:', '', ...matches.map(item => `- **${item.section} → ${item.label}** — [Open page](${item.path})\n  ${item.capabilities.join(', ')}`)].join('\n');
}
