import { NextRequest, NextResponse } from 'next/server';
import { buildOpenAISpeechRequest, decodeBase64Audio } from '@/lib/ai/openaiSpeech';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Natural voice is not configured' }, { status: 503 });
  }

  let text = '';
  try {
    const body = await req.json() as { text?: unknown };
    text = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!text) return NextResponse.json({ error: 'Reply text is required' }, { status: 400 });
  if (text.length > 6000) return NextResponse.json({ error: 'Reply is too long for voice playback' }, { status: 413 });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOpenAISpeechRequest(text, {
        model: process.env.OPENAI_SPEECH_MODEL,
        voice: process.env.OPENAI_SPEECH_VOICE,
      })),
      signal: AbortSignal.timeout(45_000),
    });

    const result = await response.json() as {
      error?: { message?: string };
      choices?: Array<{ message?: { audio?: { data?: string } } }>;
    };
    const audio = result.choices?.[0]?.message?.audio?.data;
    if (!response.ok || !audio) {
      console.error('[voice] OpenAI audio request failed:', response.status, result.error?.message || 'No audio returned');
      return NextResponse.json({ error: 'Natural voice is temporarily unavailable' }, { status: 502 });
    }

    const audioBytes = decodeBase64Audio(audio);
    const audioBuffer = audioBytes.buffer.slice(
      audioBytes.byteOffset,
      audioBytes.byteOffset + audioBytes.byteLength
    ) as ArrayBuffer;
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[voice] OpenAI audio request error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Natural voice is temporarily unavailable' }, { status: 502 });
  }
}
