// ─── Upload API Route ─────────────────────────────────────────────────────────
// POST /api/upload
// Handles file uploads, extracts text content for AI processing.

import { NextRequest, NextResponse } from 'next/server';
import { Attachment } from '@/types/chat';

export const maxDuration = 30;

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
];

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `File type "${file.type}" is not supported. Allowed: images, PDF, text files.`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit.' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const attachment: Attachment = {
      name: file.name,
      type: file.type,
      size: file.size,
    };

    // ─── Text Files ───────────────────────────────────────────────────────────
    if (file.type === 'text/plain' || file.type === 'text/csv') {
      attachment.extractedText = buffer.toString('utf-8');
      attachment.content = attachment.extractedText;
    }

    // ─── Images ───────────────────────────────────────────────────────────────
    else if (file.type.startsWith('image/')) {
      // Convert to base64 for AI vision processing
      attachment.content = buffer.toString('base64');
      attachment.extractedText = `[Image uploaded: ${file.name}. Visual content will be processed by AI.]`;
    }

    // ─── PDF ──────────────────────────────────────────────────────────────────
    else if (file.type === 'application/pdf') {
      // Basic text extraction from PDF
      // For production, integrate pdf-parse or similar
      const pdfText = await extractTextFromPDF(buffer);
      attachment.extractedText = pdfText;
      attachment.content = buffer.toString('base64');
    }

    return NextResponse.json({
      success: true,
      attachment,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'File processing failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

/**
 * Basic PDF text extraction.
 * In production, install: npm install pdf-parse
 * For now, returns a placeholder that works with the pipeline.
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Attempt to extract text by looking for text streams in PDF
    const pdfString = buffer.toString('latin1');

    // Simple extraction: find text between BT (begin text) and ET (end text) markers
    const textMatches: string[] = [];
    const btEtRegex = /BT\s*([\s\S]*?)\s*ET/g;
    let match;

    while ((match = btEtRegex.exec(pdfString)) !== null) {
      // Extract text from Tj and TJ operators
      const block = match[1];
      const tjRegex = /\((.*?)\)\s*Tj/g;
      const tjArrRegex = /\[(.*?)\]\s*TJ/g;
      let textMatch;

      while ((textMatch = tjRegex.exec(block)) !== null) {
        const text = textMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')');
        if (text.trim()) textMatches.push(text);
      }

      while ((textMatch = tjArrRegex.exec(block)) !== null) {
        const arrContent = textMatch[1];
        const strRegex = /\((.*?)\)/g;
        let strMatch;
        while ((strMatch = strRegex.exec(arrContent)) !== null) {
          if (strMatch[1].trim()) textMatches.push(strMatch[1]);
        }
      }
    }

    if (textMatches.length > 0) {
      return textMatches.join(' ').substring(0, 5000);
    }

    return '[PDF uploaded. Text extraction is limited — please paste the order details as text for better accuracy.]';
  } catch {
    return '[PDF uploaded. Could not extract text automatically. Please paste the order details as text.]';
  }
}
