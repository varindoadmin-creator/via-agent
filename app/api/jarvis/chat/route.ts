import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { runJarvis } from '@/lib/jarvis/runner';
import { approveAndCreateSalesOrder } from '@/lib/jarvis/approvals/execute';
import type { ChatResponse } from '@/types/chat';

export const maxDuration = 60;

const requestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  conversationId: z.string().min(1).max(160),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(12_000),
  })).max(20).default([]),
  attachments: z.array(z.object({
    name: z.string().max(300),
    extractedText: z.string().max(20_000).optional(),
    content: z.string().max(20_000).optional(),
  }).passthrough()).max(5).optional(),
  pendingAction: z.object({
    type: z.literal('create_so'),
    data: z.object({ approval_id: z.string().uuid() }).passthrough(),
    previewShown: z.literal(true),
  }).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse<ChatResponse>> {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) {
    return NextResponse.json({ message: 'Unauthorized', type: 'error', error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      message: 'JARVIS is not configured yet. OPENAI_API_KEY is missing.',
      type: 'error',
      error: 'JARVIS_NOT_CONFIGURED',
    }, { status: 503 });
  }

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({
        message: 'The JARVIS request is invalid.',
        type: 'error',
        error: 'INVALID_REQUEST',
      }, { status: 400 });
    }

    if (parsed.data.message === 'APPROVE CREATE SO') {
      const approvalId = parsed.data.pendingAction?.data.approval_id;
      if (!approvalId) return NextResponse.json({ message: 'No valid JARVIS Sales Order preview is awaiting approval.', type: 'error', error: 'NO_PENDING_APPROVAL' }, { status: 409 });
      const created = await approveAndCreateSalesOrder({
        approvalId,
        conversationId: parsed.data.conversationId,
        role,
      });
      return NextResponse.json({
        message: `Draft Sales Order ${created.salesorder_number} was created in Zoho Books.`,
        type: 'action_result',
        metadata: { intent: 'create_so', actionResult: { salesorder_id: created.salesorder_id, salesorder_number: created.salesorder_number } },
      });
    }

    const attachmentContext = (parsed.data.attachments || [])
      .map(file => file.extractedText || file.content || '')
      .filter(Boolean)
      .join('\n\n');
    const message = attachmentContext
      ? `${parsed.data.message}\n\nAttached document text:\n${attachmentContext}`
      : parsed.data.message;

    const result = await runJarvis({
      message,
      history: parsed.data.history,
      context: {
        role,
        conversationId: parsed.data.conversationId,
        requestId: randomUUID(),
        cache: new Map<string, unknown>(),
      },
    });

    const activitySummary = result.toolActivity.length
      ? `\n\n${result.toolActivity.map(activity => `✓ ${activity.name}`).join('\n')}`
      : '';

    if (result.actionPreview) {
      return NextResponse.json({
        message: `${result.message}${activitySummary}`,
        type: 'so_preview',
        metadata: {
          intent: 'create_so',
          previewData: { ...result.actionPreview.preview, approval_id: result.actionPreview.approval_id },
          debugInfo: { toolActivity: result.toolActivity },
        },
      });
    }

    return NextResponse.json({
      message: `${result.message}${activitySummary}`,
      type: 'text',
      metadata: {
        intent: 'jarvis_agent',
        debugInfo: { toolActivity: result.toolActivity },
      },
    });
  } catch (error) {
    const requestId = randomUUID();
    console.error('[jarvis] request failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({
      message: `JARVIS could not complete that request. No business record was changed. Reference: ${requestId}`,
      type: 'error',
      error: 'JARVIS_RUN_FAILED',
    }, { status: 502 });
  }
}
