import { NextRequest, NextResponse } from 'next/server';
import { aiCompletion } from '@/lib/ai/provider';
import { SYSTEM_PROMPT_ADDRESS_PARSE } from '@/lib/ai/prompts';
import { normalizeProvince, extractProvinceFromText, extractZipFromText, INDONESIA_PROVINCES } from '@/lib/customerCleanup/rules';

interface ParsedAddress {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  attention: string;
  phone: string;
}

// POST /api/customers/parse-address — parse a pasted Indonesian address (and,
// optionally, a name/phone in the same paste) into structured fields. Pure
// parse step — never writes anything to Zoho.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    if (!text) {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    }

    const aiResult = await aiCompletion(
      [{ role: 'user', content: text }],
      { system: SYSTEM_PROMPT_ADDRESS_PARSE, temperature: 0.1, maxTokens: 500 }
    );

    const jsonText = aiResult.content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(jsonText) as Partial<ParsedAddress>;

    // Cross-check State/Zip against the same known-value extractors the rest
    // of the app already trusts, rather than relying solely on the AI's guess.
    // normalizeProvince() returns null both when a value is already exactly
    // canonical AND when it's unrecognized — check canonical membership first
    // so an already-correct AI guess doesn't get treated as unrecognized.
    const aiState = (parsed.state || '').trim();
    const canonicalMatch = INDONESIA_PROVINCES.find(p => p.toLowerCase() === aiState.toLowerCase());
    let state = canonicalMatch || normalizeProvince(aiState) || '';
    if (!state) state = extractProvinceFromText(text) || '';

    let zip = parsed.zip?.trim() || '';
    if (!/^\d{5}$/.test(zip)) zip = extractZipFromText(text) || '';

    const phone = (parsed.phone || '').replace(/[^0-9+]/g, '');

    return NextResponse.json({
      success: true,
      address_line1: parsed.address_line1 || '',
      address_line2: parsed.address_line2 || '',
      city: parsed.city || '',
      state,
      zip,
      attention: parsed.attention || '',
      phone,
    });
  } catch (err) {
    console.error('[Parse Address] Error:', err);
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
